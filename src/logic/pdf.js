async function formatForAssembly(html, section, data) {
    html = html.toString()

    for(let datum of data) {
        let r = new RegExp("\\$\\{" + datum.key + "\\}", "g")

        //Loop again if datum.value is the accoms list
        if(Array.isArray(datum.value))
        {
            let replacer = "<div class='listed-accommodations'>"
            for(let val of datum.value) {
                let styleAdd = ""
                if(replacer) styleAdd = "margin-top: .5em; "

                replacer += "<div style='" + styleAdd + "'><strong>" + val.name + "</strong><div>" + val.content + "</div></div>"
            }
            replacer += "</div>"

            html = html.replace(r, replacer)
        }
        else
            html = html.replace(r, datum.value)
    }
    
    html = "<div class=\"" + section + "\">" + html + "</div>"
    // let height = 0

    if(section != 'body') {
        // html += "<style>." + section + " { transform: scale(.77) translateX(-7%); font-size: 1em; padding: 20px 0; width: 200%; margin: 0 auto; }</style>"

        // //Add a DOM node to test the height of a header or footer
        // let heightBlock = document.createElement('div')
        // heightBlock.innerHTML = html
        // heightBlock.style.width = "612pt"

        // document.body.appendChild(heightBlock)
        // height = heightBlock.offsetHeight + 10
        // heightBlock.remove()
        console.log("Not sure how we got here...")
    }
    else {
        //Add a DOM node to copy font settings to the inner div
        let block = document.createElement('div')
        block.innerHTML = html

        document.body.appendChild(block)
        let accomBlocks = block.querySelectorAll('.listed-accommodations')
        
        if(accomBlocks && accomBlocks.length) {
            for(let blk of accomBlocks) {
                let p = blk.previousSibling
                let span = p.children[0]
                let style = span ? span.getAttribute('style') : ""

                blk.style = style
                p.remove()
            }

            html = block.innerHTML

            block.remove()
        }
    }

    return html
    // return {
    //     height,
    //     html
    // }
}

export async function printPDF(header, body, footer, data, print = true) {
    // let formattedHeader = await formatForAssembly(header, 'header', data)
    let formattedBody = await formatForAssembly(body, 'body', data)
    let htmlOut = "<!doctype html><html><head><title>Accommodate</title><meta charset='utf-8'></head><body>" + formattedBody
    if(print) htmlOut += "<script>window.print(); window.onafterprint=function(){ window.close(); }</script>"
    htmlOut += "</body>"

    return htmlOut
    // let formattedFooter = await formatForAssembly(footer, 'footer', data)

    // const browser = await puppeteer.launch({headless: true})
    // const page = await browser.newPage()
    // await page.goto('data:text/html,' + formattedBody.html, { waitUntil: 'networkidle0' })

    // const pdf = await page.pdf({ 
    //     displayHeaderFooter: true,
    //     format: "A4",
    //     headerTemplate: " ",
    //     footerTemplate: " ",
    //     // margin: {
    //     //     top: formattedHeader.height > 40 ? (formattedHeader.height) + 'px': "40px",
    //     //     bottom: formattedFooter.height > 40 ? (formattedFooter.height) + 'px': "40px",
    //     //     left: "40px",
    //     //     right: "40px",
    //     // }
    //     margin: {
    //         top: "40px",
    //         bottom: "40px",
    //         left: "40px",
    //         right: "40px"
    //     }
    // })

    // await browser.close()
    // return pdf
}