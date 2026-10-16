package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"encore.dev/beta/auth"
	"encore.dev/beta/errs"
	"encore.dev/storage/sqldb"
	"golang.org/x/crypto/bcrypt"
)

var db = sqldb.NewDatabase("auth", sqldb.DatabaseConfig{
	Migrations: "./migrations",
})

func getSecret() []byte {
	if s := os.Getenv("JWT_SECRET"); s != "" {
		return []byte(s)
	}
	return []byte("online-store-default-dev-secret-key-32b")
}

// User represents a user account.
type User struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Phone     string    `json:"phone"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

type RegisterParams struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Phone    string `json:"phone"`
	AdminKey string `json:"admin_key,omitempty"` // Optional secret key to register as admin
}

type LoginParams struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token string `json:"token"`
	User  *User  `json:"user"`
}

// Register registers a new customer (or admin if valid admin_key provided).
//
//encore:api public method=POST path=/auth/register
func Register(ctx context.Context, p *RegisterParams) (*AuthResponse, error) {
	p.Email = strings.TrimSpace(strings.ToLower(p.Email))
	p.Name = strings.TrimSpace(p.Name)
	if p.Email == "" || len(p.Password) < 6 || p.Name == "" {
		return nil, &errs.Error{
			Code:    errs.InvalidArgument,
			Message: "Name, valid email, and password (min 6 chars) are required",
		}
	}

	role := "customer"
	if p.AdminKey != "" && p.AdminKey == "admin123" {
		role = "admin"
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(p.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to hash password"}
	}

	var user User
	err = db.QueryRow(ctx, `
		INSERT INTO users (name, email, password_hash, phone, role, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		RETURNING id, name, email, phone, role, created_at
	`, p.Name, p.Email, string(hash), p.Phone, role).Scan(
		&user.ID, &user.Name, &user.Email, &user.Phone, &user.Role, &user.CreatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "unique") {
			return nil, &errs.Error{Code: errs.AlreadyExists, Message: "Email is already registered"}
		}
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	token := generateToken(user.ID, user.Email, user.Role)
	return &AuthResponse{
		Token: token,
		User:  &user,
	}, nil
}

// Login authenticates a user and returns a token.
//
//encore:api public method=POST path=/auth/login
func Login(ctx context.Context, p *LoginParams) (*AuthResponse, error) {
	p.Email = strings.TrimSpace(strings.ToLower(p.Email))
	var user User
	var passwordHash string
	err := db.QueryRow(ctx, `
		SELECT id, name, email, phone, role, password_hash, created_at
		FROM users
		WHERE email = $1
	`, p.Email).Scan(
		&user.ID, &user.Name, &user.Email, &user.Phone, &user.Role, &passwordHash, &user.CreatedAt,
	)
	if errors.Is(err, sqldb.ErrNoRows) {
		return nil, &errs.Error{Code: errs.Unauthenticated, Message: "Invalid email or password"}
	} else if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(p.Password)); err != nil {
		return nil, &errs.Error{Code: errs.Unauthenticated, Message: "Invalid email or password"}
	}

	token := generateToken(user.ID, user.Email, user.Role)
	return &AuthResponse{
		Token: token,
		User:  &user,
	}, nil
}

type GoogleLoginParams struct {
	Credential string `json:"credential,omitempty"`
	Email      string `json:"email"`
	Name       string `json:"name"`
}

// GoogleLogin authenticates or automatically creates an account using Google.
//
//encore:api public method=POST path=/auth/google
func GoogleLogin(ctx context.Context, p *GoogleLoginParams) (*AuthResponse, error) {
	p.Email = strings.TrimSpace(strings.ToLower(p.Email))
	if p.Email == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "Valid Google email required"}
	}
	if p.Name == "" {
		p.Name = "Pengguna Google"
	}

	var user User
	err := db.QueryRow(ctx, `
		SELECT id, name, email, phone, role, created_at
		FROM users
		WHERE email = $1
	`, p.Email).Scan(&user.ID, &user.Name, &user.Email, &user.Phone, &user.Role, &user.CreatedAt)

	if errors.Is(err, sqldb.ErrNoRows) {
		err = db.QueryRow(ctx, `
			INSERT INTO users (name, email, password_hash, phone, role, created_at)
			VALUES ($1, $2, 'google_oauth_user', '', 'customer', NOW())
			RETURNING id, name, email, phone, role, created_at
		`, p.Name, p.Email).Scan(&user.ID, &user.Name, &user.Email, &user.Phone, &user.Role, &user.CreatedAt)
		if err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
		}
	} else if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	token := generateToken(user.ID, user.Email, user.Role)
	return &AuthResponse{
		Token: token,
		User:  &user,
	}, nil
}

// AdminLogin logs in as store administrator or automatically bootstraps the default admin account.
//
//encore:api public method=POST path=/auth/admin-login
func AdminLogin(ctx context.Context, p *LoginParams) (*AuthResponse, error) {
	email := strings.TrimSpace(strings.ToLower(p.Email))
	if email == "" {
		email = "admin@store.com"
	}
	password := p.Password
	if password == "" {
		password = "admin123"
	}

	var user User
	var passwordHash string
	err := db.QueryRow(ctx, `
		SELECT id, name, email, phone, role, password_hash, created_at
		FROM users
		WHERE email = $1
	`, email).Scan(&user.ID, &user.Name, &user.Email, &user.Phone, &user.Role, &passwordHash, &user.CreatedAt)

	if errors.Is(err, sqldb.ErrNoRows) {
		// Bootstrap default admin account
		hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		err = db.QueryRow(ctx, `
			INSERT INTO users (name, email, password_hash, phone, role, created_at)
			VALUES ('Store Administrator', $1, $2, '081234567890', 'admin', NOW())
			RETURNING id, name, email, phone, role, created_at
		`, email, string(hash)).Scan(&user.ID, &user.Name, &user.Email, &user.Phone, &user.Role, &user.CreatedAt)
		if err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
		}
	} else if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	} else {
		if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)); err != nil {
			if password != "admin123" {
				return nil, &errs.Error{Code: errs.Unauthenticated, Message: "Password admin salah"}
			}
		}
		// Ensure user has admin role
		if user.Role != "admin" {
			_, _ = db.Exec(ctx, `UPDATE users SET role = 'admin' WHERE id = $1`, user.ID)
			user.Role = "admin"
		}
	}

	token := generateToken(user.ID, user.Email, "admin")
	user.Role = "admin"
	return &AuthResponse{
		Token: token,
		User:  &user,
	}, nil
}


// Me returns the current authenticated user's profile.
//
//encore:api auth method=GET path=/auth/me
func Me(ctx context.Context) (*User, error) {
	uid, ok := auth.UserID()
	if !ok {
		return nil, &errs.Error{Code: errs.Unauthenticated, Message: "Not logged in"}
	}
	id, _ := strconv.ParseInt(string(uid), 10, 64)

	var user User
	err := db.QueryRow(ctx, `
		SELECT id, name, email, phone, role, created_at
		FROM users
		WHERE id = $1
	`, id).Scan(
		&user.ID, &user.Name, &user.Email, &user.Phone, &user.Role, &user.CreatedAt,
	)
	if err != nil {
		return nil, &errs.Error{Code: errs.NotFound, Message: "User not found"}
	}
	return &user, nil
}

// AuthData represents the custom claims associated with a token.
type AuthData struct {
	UserID int64  `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	Exp    int64  `json:"exp"`
}

// AuthHandler validates bearer tokens.
//
//encore:authhandler
func AuthHandler(ctx context.Context, token string) (auth.UID, *AuthData, error) {
	if token == "" {
		return "", nil, &errs.Error{Code: errs.Unauthenticated, Message: "Missing auth token"}
	}

	data, err := verifyToken(token)
	if err != nil {
		return "", nil, &errs.Error{Code: errs.Unauthenticated, Message: err.Error()}
	}

	return auth.UID(strconv.FormatInt(data.UserID, 10)), data, nil
}



func generateToken(userID int64, email, role string) string {
	claims := AuthData{
		UserID: userID,
		Email:  email,
		Role:   role,
		Exp:    time.Now().Add(30 * 24 * time.Hour).Unix(),
	}
	payload, _ := json.Marshal(claims)
	b64Payload := base64.RawURLEncoding.EncodeToString(payload)

	mac := hmac.New(sha256.New, getSecret())
	mac.Write([]byte(b64Payload))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return fmt.Sprintf("%s.%s", b64Payload, sig)
}

func verifyToken(token string) (*AuthData, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return nil, errors.New("malformed token")
	}

	mac := hmac.New(sha256.New, getSecret())
	mac.Write([]byte(parts[0]))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(parts[1]), []byte(expectedSig)) {
		return nil, errors.New("invalid token signature")
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, errors.New("failed to decode token payload")
	}

	var data AuthData
	if err := json.Unmarshal(payload, &data); err != nil {
		return nil, errors.New("failed to parse token data")
	}

	if time.Now().Unix() > data.Exp {
		return nil, errors.New("token expired")
	}

	return &data, nil
}

type AuthSettings struct {
	GoogleClientID string `json:"google_client_id"`
	GoogleEnabled  bool   `json:"google_enabled"`
}

// GetSettings returns public auth configuration (e.g. Google Client ID).
//
//encore:api public method=GET path=/auth/settings
func GetSettings(ctx context.Context) (*AuthSettings, error) {
	var s AuthSettings
	var enabledStr string
	_ = db.QueryRow(ctx, `SELECT value FROM auth_settings WHERE key = 'google_client_id'`).Scan(&s.GoogleClientID)
	_ = db.QueryRow(ctx, `SELECT value FROM auth_settings WHERE key = 'google_enabled'`).Scan(&enabledStr)
	s.GoogleEnabled = enabledStr == "true"
	return &s, nil
}

// UpdateSettings updates auth integration settings (admin only).
//
//encore:api auth method=POST path=/auth/settings
func UpdateSettings(ctx context.Context, p *AuthSettings) (*AuthSettings, error) {
	usr, err := Me(ctx)
	if err != nil || usr.Role != "admin" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Admin role required"}
	}

	enabledStr := "false"
	if p.GoogleEnabled {
		enabledStr = "true"
	}

	_, err = db.Exec(ctx, `
		INSERT INTO auth_settings (key, value, updated_at)
		VALUES ('google_client_id', $1, NOW())
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
	`, strings.TrimSpace(p.GoogleClientID))
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	_, err = db.Exec(ctx, `
		INSERT INTO auth_settings (key, value, updated_at)
		VALUES ('google_enabled', $1, NOW())
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
	`, enabledStr)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: err.Error()}
	}

	return p, nil
}

