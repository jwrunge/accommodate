<script>
    import {pdf} from './logic/pdf.js'
    import { fly, scale } from 'svelte/transition'
    import { settings, changeSettings, formatText } from './store.js'
    import Modal from "./widgets/Modal.svelte"
    const {dialog} = require('electron').remote
    import {onMount} from 'svelte'

    const getFolder = (alter)=> {
        dialog.showOpenDialog({
            properties: ['openDirectory']
        }).then(res=> {
            if(res.filePaths[0] != undefined)
                $settings[alter] = res.filePaths[0]
        })
    }
    
    let showPagesModal = false
    let pages = [
        {name: "Write " + formatText($settings.abbrev, false, false, true), value: "#write", selected: false},
        {name: formatText($settings.students, true, true), selected: false, value: "#students"},
        {name: formatText($settings.services, true, true), selected: false, value: "#accommodations"},
        {name: formatText($settings.abbrev, false, false, true) + " Template", selected: false, value: "#pdf"},
        {name: "Settings", selected: false, value: '#settings'},
        {name: "Reports", selected: false, value: '#reports'},
    ]

    let saveTimeout = null
    let curPassIndex = 0

    let save = ()=> {
        if(saveTimeout) clearTimeout(saveTimeout)
        saveTimeout = setTimeout(()=> {
            changeSettings($settings)
        }, 3000)
    }

    let addPassword = ()=> {
        if(!$settings.passwords) $settings.passwords = []
        $settings.passwords.push({
            password: "",
            pages: []
        })

        $settings.passwords = $settings.passwords
    }

    let openPagesDialog = (password, index)=> {
        //Clear selections
        pages.forEach((page)=> {
            //Deselect the page by default
            page.selected = false

            //If password object already has pages selected, select them in the pages array
            if(password.pages) {
                password.pages.forEach(pwordpage=>{
                    if(pwordpage.name == page.name) {
                        page.selected = true
                    }
                })
            }
        })
        
        curPassIndex = index
        showPagesModal = true
    }

    let savePageSettings = ()=> {
        $settings.passwords[curPassIndex].pages = pages.filter(page=>page.selected)
        showPagesModal = false
    }

    $: $settings, save()

</script>

<style>
    .select-pages {
        cursor: pointer;
    }

    #pages-list {
        display: grid;
        grid-template-columns: 1fr 1fr;
        overflow-y: scroll;
        list-style: none;
        grid-gap: 1em;
        padding-left: 0;
        min-width: 30em;
    }

    #pages-list li {
        background-color: #C33C54;
        color: white;
        padding: .5em;
        text-align: center;
        border-radius: 5px;
        cursor: pointer;
    }

    #pages-list li:hover {
        filter: brightness(1.2);
    }

    #pages-list li.selected {
        background-color: #8EE3EF;
        color: #37718E;
        font-weight: bold;
    }
</style>

<div style='position: relative;' in:fly={{x: 100, delay: 500}} out:fly={{x: 100}}>
    <h2>Settings</h2>
    <h3>Terminology</h3>
    <p>What do you call the document this app helps you to create? (Use an abbreviation or common name if possible; for example, "LOA" for "Letter of Accommodation")</p>
    <input type="text" bind:value={$settings.abbrev}>
    
    <p>What do you call the services you provide? (eg accommodations, services, supports)</p>
    <input type="text" bind:value={$settings.services}>
    
    <p>What do you call the people you serve? (eg students, clients, customers)</p>
    <input type="text" bind:value={$settings.students}>

    <h2>Security</h2>
    <p>You can set up passwords for the various pages of Accommodate to implement nominal security. <strong>This is not strong security, and will not prevent access to a determined attacker.</strong> All settings can be overridden easily by altering app files. It is expected that this app will be stored in a location with sufficient access restrictions. This password system is only meant to discourage accidental alteration to app settings and data by unauthorized (but non-malicious) users.</p>
    {#if $settings.passwords}
        {#each $settings.passwords as password, i}
            <div class='passwords whitebox'>
                <input type='text' placeholder="Password" bind:value={password.password} on:change={()=>{$settings = $settings}}>
                <input type="text" class='select-pages' placeholder='Pages' value={password.pages.map(el => el.name).join(', ')} on:click={()=>{openPagesDialog(password, i)}} readonly>
                <div class='close' on:click={()=>{ $settings.passwords.splice(i,1); $settings = $settings }}>&times;</div>
            </div>
        {/each}
    {/if}
    <button type='submit' class='blue' on:click|preventDefault={addPassword}>Add password</button>

    <h2>Data</h2>
    <h3>Sources</h3>
    <p>The database files for this app are located here: <a href='changepath' on:click|preventDefault={()=>{getFolder('databasedir')}}>{$settings.databasedir}</a></p>
    <p>The database backups are located here: <a href='changepath' on:click|preventDefault={()=>{getFolder('backupdir')}}>{$settings.backupdir}</a></p>
    <h3>Manage Data</h3>
    <p><button type='submit' class='blue' on:click|preventDefault={()=>{}}>Import data</button>You can import data <em>en masse</em> by loading a CSV file. Records with no specified ID will be assigned one; records with IDs that already exist will be replaced by the imported data. CSV files can be created in most spreadsheet programs, including Microsoft Excel.</p>
    <div class="inline">
        <button type='submit' class='blue' on:click|preventDefault={()=>{}}>Back up data</button>
        <button type='submit' class='blue' on:click|preventDefault={()=>{}}>Restore backup</button>
        <button type='submit' on:click|preventDefault={()=>{}}>Clear data</button>
    </div>
</div>

{#if showPagesModal}
    <Modal on:forceClose={()=>{ showPagesModal = false }}>
        <h3>Select {formatText($settings.services, true, true)}</h3>
        <ul id='pages-list'>
            {#each pages as page}
                <li class:selected={page.selected} on:click={()=>{page.selected = !page.selected; $settings = $settings }}>{page.name}</li>
            {/each}
        </ul>
        <button class='centered blue' type='submit' on:click|preventDefault={savePageSettings}>OK</button>
    </Modal>
{/if}