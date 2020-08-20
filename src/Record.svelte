<script>
    import { onMount } from 'svelte'
    import { fly, scale } from 'svelte/transition'
    import { loadRecords } from './logic/data.js'
    import { settings, formatText } from './store.js'
    import Modal from "./widgets/Modal.svelte"
    import { printPDF } from './logic/pdf.js'
    const {shell} = require('electron')

    const fs = require('fs')
    const app = require('electron').remote.app

    const root = app.getAppPath()

    let sid = ""
    let record = null

    let currentRecord = {}
    let recordModalOpen = false

    let bodyData

    function printDoc(data) {
        let formattedData = [
            { key: "first name", value: data.student.fname},
            { key: "last name", value: data.student.lname},
            { key: "id", value: data.student._id },
            { key: "date", value: (new Date(data.dateUpdated).getMonth() + 1) + "/" + new Date(data.dateUpdated).getDate() + "/" + new Date(data.dateUpdated).getFullYear() },
            { key: formatText($settings.services, true, false), value: data.accoms },
            { key: formatText($settings.students, false, false) + " notes", value: data.studentNotes },
        ]

        printPDF(" ", bodyData, " ", formattedData).then(pdf=> {
            fs.writeFileSync(root + '/appdata/target.pdf', pdf)
            shell.openItem(root + "/appdata/target.pdf")
        })
        .catch(e=> {
            console.log(e)
            previewModalOpen = false
            docErrorModalOpen = true
        })

        currentRecord = {}
    }

    onMount(()=>{
        sid = window.location.hash.split('/')[1]
        loadRecords(sid, $settings.databasedir).then((result)=> {
            record = result
        })

        bodyData = fs.existsSync(root + '/appdata/body.accom') ? fs.readFileSync(root + '/appdata/body.accom') : ""
    })

</script>

<style>
    #accoms-list {
        width: 40em;
    }
</style>

{#if record}
    <div style='position: relative;' in:fly={{x: 100, delay: 500}} out:fly={{x: 100}}>
        <h2>Record for {record.student.lname + ", " + record.student.fname + " (" + record.student._id + ")"}</h2>
        <a href="#students">Back to {formatText($settings.students, true, false)}</a>
        <h3>Current {formatText($settings.services, true, true)}</h3>
        <ul>
            {#if record.accoms && record.accoms.length}
                {#each record.accoms as accom}
                    <li>{accom.name}</li>
                {/each}
            {:else}
                <li>None listed</li>
            {/if}
        </ul>

        <h3>{formatText($settings.abbrev, false, false, true)} Documents</h3>
        <ul>
            {#if record.records && record.records.length}
                {#each record.records as doc}
                    <li>
                        <a href={"#record/" + record.records._id} on:click|preventDefault={()=>{ currentRecord = doc; recordModalOpen = true }}>
                            {"Issued " + (new Date(doc.dateUpdated).getMonth() + 1) + "/" + new Date(doc.dateUpdated).getDate() + "/" + new Date(doc.dateUpdated).getFullYear()}
                        </a>
                    </li>
                {/each}
            {:else}
                <li>None listed</li>
            {/if}
        </ul>
    </div>
{/if}

{#if recordModalOpen}
    <Modal on:forceClose={()=>{ recordModalOpen = false; currentRecord = {} }}>
        <h3>{new Date(currentRecord.dateUpdated).getMonth()+1 + "/" + new Date(currentRecord.dateUpdated).getDate() + "/" + new Date(currentRecord.dateUpdated).getFullYear()}</h3>
        
        <p class='mt-0'>
            <strong>Date updated: </strong>{new Date(currentRecord.dateUpdated).getMonth()+1 + "/" + new Date(currentRecord.dateUpdated).getDate() + "/" + new Date(currentRecord.dateUpdated).getFullYear()}
        </p>

        <h4>{formatText($settings.students, false, true)} Information</h4>
        <p class='mt-0'>
            <strong>Name: </strong>{currentRecord.student.lname + ", " + currentRecord.student.fname}
            <br>
            <strong>ID: </strong>{currentRecord.student._id}
        </p>
    
        <h4>Approved {formatText($settings.services, true, true)}</h4>
        <ul id='accoms-list'>
            {#if currentRecord.accoms.length > 0}
                {#each currentRecord.accoms as accom}
                    <li class='whitebox'>
                        <h4>{accom.name}</h4>
                        <p>{accom.content}</p>
                    </li>
                {/each}
            {:else}
                <li>No {formatText($settings.services, true, false)} listed</li>
            {/if}
        </ul>
    
        <h4>{formatText($settings.students, false, true)} Notes</h4>
        <p class='mt-0'>{currentRecord.studentNotes ? currentRecord.studentNotes : "Nothing specified"}</p>

        <div class="align-ends">
            <button class='centered blue' type='submit' on:click|preventDefault={()=> {  recordModalOpen = false; currentRecord = {} } }>OK</button>
            <button class='centered' type='submit' on:click|preventDefault={()=> {  recordModalOpen = false; printDoc(currentRecord) } }>Print</button>
        </div>
    </Modal>
{/if}
