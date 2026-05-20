sources := "manifest.json background.js bangs.js hosts.js options.html options.js storage.js"
out := "pkg/taxonworks-omnibox.zip"

pkg:
    mkdir -p pkg
    rm -f {{out}}
    zip {{out}} {{sources}}
    @echo "built {{out}}"

clean:
    rm -rf pkg

test:
    npm test
