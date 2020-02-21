<script>
    import { fly, scale } from 'svelte/transition'
    import {onMount} from 'svelte'
    import { settings, formatText } from './store.js'
    import Modal from './widgets/Modal.svelte'
    import PDF from './PDF.svelte'
    import { printPDF, convertToHTML } from './logic/pdf.js'
    const cp = require("child_process")

    const fs = require('fs')
    const app = require('electron').remote.app

    const root = app.getAppPath()

    let pdfHeaderModalOpen = false
    let pdfBodyModalOpen = false
    let pdfFooterModalOpen = false
    let previewModalOpen = false
    let docErrorModalOpen = false

    let headerData = fs.existsSync(root + '/appdata/header.json') ? JSON.parse(fs.readFileSync(root + '/appdata/header.json')) : []
    let bodyData = fs.existsSync(root + '/appdata/body.json') ? JSON.parse(fs.readFileSync(root + '/appdata/body.json')) : []
    let footerData = fs.existsSync(root + '/appdata/footer.json') ? JSON.parse(fs.readFileSync(root + '/appdata/footer.json')) : []

    let sampleData = {
        fname: "Sample",
        lname: "Person"
    }

    let preview = ()=> {
        previewModalOpen = true
        
        printPDF(headerData, bodyData, footerData, sampleData).then(()=> {
            previewModalOpen = false
            cp.exec(root + '/appdata/newerpdf.pdf')
        })
        .catch(()=> {
            previewModalOpen = false
            docErrorModalOpen = true
        })
    }

    let saveHeader = (e)=> {
        fs.writeFileSync(root + '/appdata/header.json', JSON.stringify(e.detail))
        headerData = e.detail
    }

    let saveBody = (e)=> {
        fs.writeFileSync(root + '/appdata/body.json', JSON.stringify(e.detail))
        bodyData = e.detail
    }

    let saveFooter = (e)=> {
        fs.writeFileSync(root + '/appdata/footer.json', JSON.stringify(e.detail))
        footerData = e.detail
    }
    
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

    <h3>Edit Sections</h3>
    <ul>
        <li><a href="heading" on:click|preventDefault={()=>{pdfHeaderModalOpen = true}}>Header</a> - The header appears at the top of every page.</li>
        <li><a href="body" on:click|preventDefault={()=>{pdfBodyModalOpen = true}}>Body</a> - The body makes up the majority of your document, and may span multiple pages.</li>
        <li><a href="footer" on:click|preventDefault={()=>{pdfFooterModalOpen = true}}>Footer</a> - The footer appears at the bottom of each page.</li>
    </ul>
    <button type='submit' on:click|preventDefault={preview}>Preview</button>

    <h3>Tips</h3>
    <p>Here are some things to consider as you create your template:</p>
    <ul>
        <li></li>
        <li></li>
        <li></li>
        <li></li>
        <li></li>
    </ul>
</div>

{#if pdfHeaderModalOpen}
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
{/if}
{#if previewModalOpen}
    <Modal on:forceClose={()=>{ previewModalOpen = false }}>
        <h3>Building PDF</h3>
        <p>Your preview will be available shortly!</p>
    </Modal>
{/if}
{#if docErrorModalOpen}
    <Modal on:forceClose={()=>{ docErrorModalOpen = false }}>
        <h3>Whoops!</h3>
        <p>There was an error opening your preview. Make sure the document is not already open, and close it if it is.</p>
        <button type='submit' class='centered blue' on:click|preventDefault={()=>{docErrorModalOpen = false}}>OK</button>
    </Modal>
{/if}