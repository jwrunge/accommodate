// This file is necessary despite rollup.config.js for the svelte language server
// Prevents errors, allows for syntax highlighting in scss

const sass = require('node-sass');

module.exports = {
    preprocess: {
        style: async ({ content, attributes }) => {
            if (attributes.type !== 'text/scss' && attributes.lang !== 'scss') return;

            return new Promise((resolve, reject) => {
                sass.render(
                    {
                        data: content,
                        sourceMap: true,
                        outFile: 'x', // this is necessary, but is ignored
                    },
                    (err, result) => {
                        if (err) return reject(err);

                        resolve({
                            code: result.css.toString(),
                            map: result.map.toString(),
                        });
                    },
                );
            });
        },
    },
};