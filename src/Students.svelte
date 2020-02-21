<script>
    import { onMount } from 'svelte'
    import { fly, scale } from 'svelte/transition'
    import {abbreviate, loadStudents, saveStudent, removeStudent, countStudents} from './logic/data.js'
    import Fuse from 'fuse.js'
    import { settings, formatText } from './store.js'

    import Modal from "./widgets/Modal.svelte"

    let studs = []
    let searchResults = []

    let studCreatorOpen = false
    let showConfirmModal = false
    let showDeleteConfirmModal = false

    let searchTimeout = null
    let searchBox = null
    let studContentHighlighted = false

    let resultsPerPage = 10
    let page = 0
    let studentCount = 0

    let newStud = {
        fname: "", lname: "", _id: ""
    }
    let toDelete = ""

    let fuse = null

    let save = ()=> {
        saveStudent(newStud, $settings.databasedir).then(()=>{
            searchTime(searchBox.value, 0)
        })
    }

    let searchTime = (search, timeout = 600)=> {
        return new Promise((resolve)=>{
            if(searchTimeout) clearTimeout(searchTimeout)
            searchTimeout = setTimeout(()=>{
                loadStudents(resultsPerPage * page, resultsPerPage, search, $settings.databasedir).then((studsLoaded)=>{

                    countStudents($settings.databasedir).then((count)=> {
                        studentCount = count
                    })

                    studs = studsLoaded
                    studCreatorOpen = false
                    newStud = {
                        fname: "", lname: "", _id: ""
                    }

                    fuse = new Fuse(studs, { keys: ["student.fname", "student.lname", "student._id"] })

                    if(search == "")
                        searchResults = studs
                    else
                        searchResults = fuse.search(search)

                    resolve(true)
                })
            }, timeout)
        })
    }

    let removeStud = (id)=> {
        toDelete = id
        showConfirmModal = true
    }

    let deleteConfirm = (id) => {
        removeStudent(id, $settings.databasedir).then(()=>{
            toDelete = ""
            showDeleteConfirmModal = true
            showConfirmModal = false

            searchTime(searchBox.value, 0)
        })
    }

</script>

<style>
    .student a {
        display: block;
        margin-top: .5em;
        text-align: right;
        position: relative;
        left: 2em;
    }

    .pagination {
        display: flex;
        width: 100%;
        justify-content: space-between;
        margin: .5em auto;
        align-items: center;
    }

    .controls {
        font-size: 1.5em;
    }

    .controls a {
        text-decoration: none;
    }

</style>

{#await searchTime("", 0)}
    <div class='loading'>Loading...</div>
{:then}
    <div style='position: relative;' in:fly={{x: 100, delay: 500}} out:fly={{x: 100}}>
        <div class='switchable'>
            <h2>{formatText($settings.students, true, true)}</h2>
        </div>
        <div class='form-halves'>
            <label for="search">Find: </label>
            <input bind:this={searchBox} type="text" id='search' on:keyup={()=>{searchTime(searchBox.value)}}>
        </div>
        <div>Search by name or ID.</div>
        <div class="mt-2 mb-1">
            <a href="newStud" on:click|preventDefault={()=>{studCreatorOpen = true}}>New {formatText($settings.students, false, false)}</a>
        </div>

        <div class="pagination">
            <div class='controls'>
                <a href="firstpage" on:click|preventDefault={()=>{ page = 0; searchTime(searchBox.value, 0) }}>&laquo;</a>
                <a href="prevpage" on:click|preventDefault={()=>{ page > 0 ? page -= 1 : page = 0; searchTime(searchBox.value, 0) }}>&lsaquo;</a>
            </div>
            <div>Results {resultsPerPage * page + 1} - {(resultsPerPage * page + resultsPerPage) < studentCount ? (studentCount * page + resultsPerPage) : studentCount}</div>
            <div class='controls'>
                <a href="nextpage" on:click|preventDefault={()=>{ page < Math.floor(studentCount / resultsPerPage) ? page += 1 : page = Math.floor(studentCount / resultsPerPage); searchTime(searchBox.value, 0) }}>&rsaquo;</a>
                <a href="lastpage" on:click|preventDefault={()=>{ page = Math.floor(studentCount / resultsPerPage); searchTime(searchBox.value, 0) }}>&raquo;</a>
            </div>
        </div>
        
        {#if searchResults.length}
            {#each searchResults as loa}
                <div class='student whitebox'>
                    <h4>{loa.student.lname + ", " + loa.student.fname + " (" + loa.student._id + ")"}</h4>
                    <p>{abbreviate("Current accommodations: " + ((loa.accomsList && loa.accomsList.length) ? loa.accomsList.join(", ") : "none listed"), 200)}</p>
                    <a href={"#record/" + loa.student._id}>See record</a>
                    <div class='close' on:click={()=>{ removeStud(loa.student._id) }}>&times;</div>
                    <div class='close edit' on:click={()=>{ newStud = loa.student; studCreatorOpen = true }}>&#9998;</div>
                </div>
            {/each}
        {:else}
            <p>No {formatText($settings.students, true, false)} found. :-(</p>
        {/if}
    </div>
{/await}

{#if studCreatorOpen}
    <Modal on:forceClose={()=>{ studCreatorOpen = false; newStud = { fname: "", lname: "", _id: "" } }}>
        <h3>{formatText($settings.students, false, true)} Details</h3>
        <form id='new-stud-form'>
            <div class="form-halves">
                <label for='fname'>First name</label>
                <input type="text" id='fname' bind:value={newStud.fname}>
            </div>
            <div class="form-halves">
                <label for='fname'>Last name</label>
                <input type="text" id='fname' bind:value={newStud.lname}>
            </div>
            <div class="form-halves">
                <label for='id'>{formatText($settings.students, false, true)} ID</label>
                <input type="text" id='id' bind:value={newStud._id}>
            </div>

            <button class='centered blue' type='submit' on:click|preventDefault={()=> {save(); studCreatorOpen = false} }>OK</button>
        </form>
    </Modal>
{/if}

{#if showConfirmModal}
    <Modal on:forceClose={()=>{ showConfirmModal = false; toDelete = "" }}>
        <h3>Are you sure?</h3>
        <p>If you delete this {formatText($settings.students, false, false)}, it will not be recoverable. This will not affect {formatText($settings.students, false, false)}'s committed {formatText($settings.services, false, false)} history.</p>
        <div class="align-ends">
            <button class='centered' type='submit' on:click|preventDefault={()=> { deleteConfirm(toDelete) }}>Delete it</button>
            <button class='centered blue' type='submit' on:click|preventDefault={()=> {  showConfirmModal = false; toDelete = "" } }>Never mind</button>
        </div>
    </Modal>
{/if}

{#if showDeleteConfirmModal}
    <Modal on:forceClose={()=>{ showDeleteConfirmModal = false }}>
        <h3>All done!</h3>
        <p>The indicated student has been removed from the list.</p>
        <button class='centered blue' type='submit' on:click|preventDefault={()=> {  showDeleteConfirmModal = false } }>OK</button>
    </Modal>
{/if}