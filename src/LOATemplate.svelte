<script>
    import { fly, scale } from 'svelte/transition'
    import { settings, formatText } from './store.js'
    import Modal from './widgets/Modal.svelte'
    import PDF from './PDF.svelte'
    import { printPDF } from './logic/pdf.js'
    const {shell} = require('electron')

    const fs = require('fs')
    const app = require('electron').remote.app

    // const root = app.getAppPath()

    let pdfHeaderModalOpen = false
    let pdfBodyModalOpen = false
    let pdfFooterModalOpen = false
    let previewModalOpen = false
    let docErrorModalOpen = false
    let savedModalOpen = false

    let headerData = ""//fs.existsSync(root + '/accommodateData/header.accom') ? fs.readFileSync(root + '/accommodateData/header.accom') : ""
    let bodyData = fs.existsSync($settings.systemdir + '/body.accom') ? fs.readFileSync($settings.systemdir + '/body.accom') : ""
    let footerData = ""//fs.existsSync(root + '/accommodateData/footer.accom') ? fs.readFileSync(root + '/accommodateData/footer.accom') : ""

    let sampleData = [
        { key: "first name", value: "Sample"},
        { key: "last name", value: formatText($settings.students, false, true)},
        { key: "id", value: "12345" },
        { key: "date", value: "" },
        // { key: formatText($settings.services, true, false), value: "No " + formatText($settings.services, true, false) + " listed" },
        { key: formatText($settings.services, true, false), value: [{name: "Good times", content: "For all"}, {name: "Love it", content: "Don't list it"}] },
        { key: formatText($settings.students, false, false) + " notes", value: "No notes listed" },
    ]

    let preview = ()=> {
        previewModalOpen = true

        //Get date
        let today = new Date()
        sampleData[3].value = (today.getMonth() + 1) + "/" + today.getDate() + "/" + today.getFullYear()
        
        printPDF(headerData, bodyData, footerData, sampleData, false).then(html=> {
            fs.writeFileSync($settings.systemdir + '/doc.html', html)
            previewModalOpen = false
            shell.openItem($settings.systemdir + "/doc.html")
        })
        .catch(e=> {
            console.log(e)
            previewModalOpen = false
            docErrorModalOpen = true
        })
    }

    // let saveHeader = (e)=> {
    //     fs.writeFileSync(root + '/accommodateData/header.accom', e.detail)
    //     headerData = e.detail
    // }

    let saveBody = (e)=> {
        fs.writeFileSync($settings.systemdir + '/body.accom', e.detail)
        bodyData = e.detail
        savedModalOpen = true
    }

    // let saveFooter = (e)=> {
    //     fs.writeFileSync(root + '/accommodateData/footer.accom', e.detail)
    //     footerData = e.detail
    // }
    
</script>

<style>
    .small {
        font-size: .8em;
        position: absolute;
        bottom: .5em;
        right: 2em;
        text-align: right;
    }
</style>

<div style='position: relative;' in:fly={{x: 100, delay: 500}} out:fly={{x: 100}}>
    <h2>{formatText($settings.abbrev, false, false, true)} Template</h2>
    <p>Set up your {formatText($settings.abbrev, false, false, true)} template below.</p>

    <PDF pdfSettings={{editing: 'body', placeholder: "Write your document here!" }} content={bodyData} on:forceClose={()=>{ pdfBodyModalOpen = false }} on:save={saveBody} on:preview={preview}></PDF>
    <!-- <h3>Edit Sections</h3>
    <ul>
        <li><a href="heading" on:click|preventDefault={()=>{pdfHeaderModalOpen = true}}>Header</a> - The header appears at the top of every page.</li>
        <li><a href="body" on:click|preventDefault={()=>{pdfBodyModalOpen = true}}>Body</a> - The body makes up the majority of your document, and may span multiple pages.</li>
        <li><a href="footer" on:click|preventDefault={()=>{pdfFooterModalOpen = true}}>Footer</a> - The footer appears at the bottom of each page.</li>
    </ul> -->
    
    <p><strong>*NOTE*</strong> - Changing terminology settings on the "Settings" page will change how some variables are processed in the template. You may need to edit your template after terminology changes.</p>
</div>

<!-- {#if pdfHeaderModalOpen}
    <Modal on:forceClose={()=>{ pdfHeaderModalOpen = false }}>
        <PDF pdfSettings={{editing: 'header', placeholder: "Your header here..." }} content={headerData} on:forceClose={()=>{ pdfHeaderModalOpen = false }} on:save={saveHeader}></PDF>
    </Modal>
{/if}
{#if pdfBodyModalOpen}
    <Modal on:forceClose={()=>{ pdfBodyModalOpen = false }}>
        <PDF pdfSettings={{editing: 'body', placeholder: "Write your document here!" }} content={bodyData} on:forceClose={()=>{ pdfBodyModalOpen = false }} on:save={saveBody}></PDF>
    </Modal>
{/if}
{#if pdfFooterModalOpen}
    <Modal on:forceClose={()=>{ pdfFooterModalOpen = false }}>
        <PDF pdfSettings={{editing: 'footer', placeholder: "Your footer here..." }} content={footerData} on:forceClose={()=>{ pdfFooterModalOpen = false }} on:save={saveFooter}></PDF>
    </Modal>
{/if} -->
{#if previewModalOpen}
    <Modal on:forceClose={()=>{ previewModalOpen = false }}>
        <h3>Rendering Output</h3>
        <p>Your preview will be available shortly!</p>
    </Modal>
{/if}

{#if savedModalOpen}
    <Modal on:forceClose={()=>{ savedModalOpen = false }}>
        <h3>Template saved!</h3>
        <p>You're good to go!</p>
        <button type='submit' class='centered blue' on:click|preventDefault={()=>{savedModalOpen = false}}>OK</button>
    </Modal>
{/if}

{#if docErrorModalOpen}
    <Modal on:forceClose={()=>{ docErrorModalOpen = false }}>
        <h3>Whoops!</h3>
        <p>There was an error opening your preview. Make sure the document is not already open, and close it if it is.</p>
        <button type='submit' class='centered blue' on:click|preventDefault={()=>{docErrorModalOpen = false}}>OK</button>
    </Modal>
{/if}