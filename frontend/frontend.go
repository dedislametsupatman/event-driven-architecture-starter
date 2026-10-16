// Service frontend serves the frontend for development purposes.
package frontend

import (
	"embed"
	"io"
	"io/fs"
	"net/http"
	"strings"
)

var (
	//go:embed dist
	dist embed.FS

	assets, _ = fs.Sub(dist, "dist")
	handler   = http.FileServer(http.FS(assets))
)

// Serves the frontend at the root URL with SPA fallback.
//
//encore:api public raw path=/!path
func Index(w http.ResponseWriter, req *http.Request) {
	path := strings.TrimPrefix(req.URL.Path, "/")
	if path != "" {
		if f, err := assets.Open(path); err == nil {
			_ = f.Close()
			handler.ServeHTTP(w, req)
			return
		}
	}

	// SPA fallback: serve index.html for client-side routes such as /cms
	indexFile, err := assets.Open("index.html")
	if err != nil {
		http.NotFound(w, req)
		return
	}
	defer indexFile.Close()

	stat, err := indexFile.Stat()
	if err != nil {
		http.NotFound(w, req)
		return
	}

	if seeker, ok := indexFile.(io.ReadSeeker); ok {
		http.ServeContent(w, req, "index.html", stat.ModTime(), seeker)
	} else {
		handler.ServeHTTP(w, req)
	}
}
