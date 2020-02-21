const puppeteer = require('puppeteer')
import { QuillDeltaToHtmlConverter } from 'quill-delta-to-html'
const app = require('electron').remote.app
const fs = require('fs')

const root = app.getAppPath()

export function convertToHTML(delta, data = []) {
    let config = {
        inlineStyles: {}
    }
    let converter = new QuillDeltaToHtmlConverter(delta.ops, config)
    converter.afterRender((groupType, htmlString)=> {
        Object.keys(data).forEach(x=>{
            htmlString = htmlString.replace('{$' + x + '}', data[x])
        })
        return htmlString
    })

    return converter.convert()
}

export async function formatHTML(html, section) {
    

    //Get height (for header and footer)
    //Code here!
}

export async function formatForAssembly(html, section) {
    html.replace(/“/g, '&quot;').replace(/”/g, '&quot;').replace(/'/g, '&quot;').replace(/'/g, '&apos;')

    let wrapper = document.createElement('div')
    wrapper.classList.add('sectionWrapper')
    wrapper.style.visibility = 'hidden'
    wrapper.style.position = 'fixed'
    wrapper.style.top = 0
    wrapper.style.left = 0

    //Remove any cursor object
    let cursors = document.querySelectorAll('span.ql-cursor')
    console.log(cursors)
    cursors.forEach(cursor => cursor.remove())

    //Cut unnecessary starting/ending space
    let first11 = html.substring(0, 11)
    let mainBody = html.substring(11, html.length - 11)
    let last11 = html.substring(html.length - 11, html.length)

    first11 = first11.replace(/<p><br><\/p>/g, "")
    last11 = last11.replace(/<p><br><\/p>/g, "")
    if(section != 'body') 
        wrapper.innerHTML = `<style>#header, #footer { padding: 0 !important; }</style> <div style='font-size: 12px; margin: 0 40px; padding: 40px 0;'>` + first11 + mainBody + last11 + "</div>"
    else
        wrapper.innerHTML = first11 + mainBody + last11

    //Set table settings
    let tables = wrapper.querySelectorAll('table')
    if(tables) {
        tables.forEach((table)=> {
            let tableWidth = parseInt(table.style.width)
            table.style = "width: 100%;"

            let cols = table.querySelectorAll('col')
            let colPercents = []
            cols.forEach((col)=> {
                let colWidth = parseInt(col.width)
                let newWidth = (colWidth / tableWidth * 100) + "%"
                colPercents.push(newWidth)
            })

            table.removeChild(table.querySelector('colgroup'))

            let tds = table.querySelectorAll('td')
            tds.forEach((td, index)=> {
                let commonStyle = 'border: none; overflow: hidden;'
                if(index < colPercents.length)
                    td.style = commonStyle + " width: " + colPercents[index] + ";"
                else
                    td.style = commonStyle

                let tableImgs = td.querySelectorAll('img')
                tableImgs.forEach(im => im.style = 'width: 100%;')
            })
        })
    }

    let wrapperStyle = document.createElement('style')
    wrapperStyle.innerHTML = ".ql-align-right { text-align: right; } .ql-align-center { text-align: center; } .ql-align-justify { text-align: justified; }"
    wrapper.appendChild(wrapperStyle)

    //Get height for header/footer
    if(section != 'body') {
        document.body.appendChild(wrapper)

        return new Promise((resolve, reject)=> {
            setTimeout(()=> {
                let innerDiv = wrapper.querySelector('div')
                let height = innerDiv.clientHeight + parseInt(innerDiv.style.marginTop) + parseInt(innerDiv.style.marginBottom) 
                resolve({html: wrapper.innerHTML, height})
                wrapper.remove()
            }, 100)
        })
    }

    else return {html: wrapper.innerHTML}
}



export async function printPDF(header, body, footer, data) {
    let formattedHeader = await formatForAssembly(header, 'header')
    let formattedBody = await formatForAssembly(body, 'body')
    let formattedFooter = await formatForAssembly(footer, 'footer')

    const browser = await puppeteer.launch({headless: true})
    const page = await browser.newPage()
    await page.goto('data:text/html,' + formattedBody.html, { waitUntil: 'networkidle0' })

    const pdf = await page.pdf({ 
        path: root + '/appdata/newerpdf.pdf',
        displayHeaderFooter: true,
        format: "A4",
        headerTemplate: formattedHeader.html,
        footerTemplate: formattedFooter.html,
        margin: {
            top: formattedHeader.height > 40 ? (formattedHeader.height) + 'px': "40px",
            bottom: formattedFooter.height > 40 ? (formattedFooter.height) + 'px': "40px",
            left: "40px",
            right: "40px",
        },
        printBackground: true
    })

    await browser.close()
}