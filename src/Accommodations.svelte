<script>
    import { onMount } from 'svelte'
    import { fly, scale } from 'svelte/transition'
    import {abbreviate, loadAccommodations, saveAccommodation, removeAccommodation} from './logic/data.js'
    import Fuse from 'fuse.js'
    import { settings, formatText } from './store.js'

    import Modal from "./widgets/Modal.svelte"

    let accoms = []
    let searchResults = []

    let accomCreatorOpen = false
    let showConfirmModal = false
    let showDeleteConfirmModal = false

    let searchTimeout = null
    let searchBox = null
    let accomContentHighlighted = false

    let newAccom = {
        name: "",
        content: ""
    }
    let toDelete = ""

    let fuse = null

    let save = ()=> {
        saveAccommodation(newAccom, $settings.databasedir).then(()=>{
            loadAccommodations($settings.databasedir).then((accomsLoaded)=>{
                accoms = accomsLoaded
                accomCreatorOpen = false
                newAccom = { name: "", content: "" }
                fuse = new Fuse(accoms, { keys: ["name", "content"] })
                searchTime(searchBox.value)
            })
        })
    }

    let searchTime = (search)=> {
        if(searchTimeout) clearTimeout(searchTimeout)
        searchTimeout = setTimeout(()=>{
            if(search == "")
                searchResults = accoms
            else
                searchResults = fuse.search(search)
        }, 600)
    }

    let removeAccom = (id)=> {
        toDelete = id
        showConfirmModal = true
    }

    let deleteConfirm = (id) => {
        removeAccommodation(id, $settings.databasedir).then(()=>{
            toDelete = ""
            showDeleteConfirmModal = true
            showConfirmModal = false

            loadAccommodations($settings.databasedir).then((accomsLoaded)=>{
                accoms = accomsLoaded
                accomCreatorOpen = false
                newAccom = { name: "", content: "" }
                fuse = new Fuse(accoms, { keys: ["name", "content"] })
                searchTime(searchBox.value)
            })
        })
    }

    onMount(()=>{
        loadAccommodations($settings.databasedir).then((accomsLoaded)=>{
            accoms = accomsLoaded
            searchResults = accoms

            fuse = new Fuse(accoms, { keys: ["name", "content"] })
        })
    })

</script>

<style>

    #new-accom-form .in { margin-left: .5em; }
    #new-accom-form textarea { display: block; margin: 0; min-height: 15vh; }

    .form-halves2 {
        margin-left: .5em;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: .5em;
    }

    .form-halves2 label {
        margin-right: 1em;
    }

    .form-halves2 input {
        flex-grow: 2;
    }

    .accom-content-wrapper {
        position: relative;
    }

    .extend {
        width: 20em;
    }

</style>

<div style='position: relative;' in:fly={{x: 100, delay: 500}} out:fly={{x: 100}}>
    <div class='switchable'>
        <h2>{formatText($settings.services, true, true)}</h2>
    </div>
    <div class='form-halves'>
        <label for="search">Find: </label>
        <input bind:this={searchBox} type="text" id='search' on:keyup={()=>{searchTime(searchBox.value)}}>
    </div>
    <div>Search by {formatText($settings.services, false, false)} title or description.</div>

    <div class="mt-2 mb-1">
        <a href="newAccom" on:click|preventDefault={()=>{accomCreatorOpen = true}}>New {formatText($settings.services, false, false)}</a>
    </div>
    
    {#if searchResults.length}
        {#each searchResults as accom}
            <div class='accommodation whitebox'>
                <h4>{accom.name}</h4>
                <p>{abbreviate(accom.content, 200)}</p>
                <div class='close' on:click={()=>{ removeAccom(accom._id) }}>&times;</div>
                <div class='close edit' on:click={()=>{ newAccom = accom; accomCreatorOpen = true }}>&#9998;</div>
            </div>
        {/each}
    {:else}
        <p>No {formatText($settings.services, true, false)} found. :-(</p>
    {/if}
</div>

{#if accomCreatorOpen}
    <Modal on:forceClose={()=>{ accomCreatorOpen = false; newAccom = { name: "", content: "" } }}>
        <h3 class='extend'>{formatText($settings.services, false, true)} Details</h3>
        <form id='new-accom-form'>
            <div class="form-halves2">
                <label for='name'>Name</label>
                <input type="text" id='name' bind:value={newAccom.name}>
            </div>
            <div class="in">
                <label for="content">Content</label><br/>
                <div class="accom-content-wrapper">
                    {#if accomContentHighlighted}
                        <div transition:scale class='remaining-characters'>
                            { newAccom.content.length ? 1200 - newAccom.content.length : 1200}
                        </div>
                    {/if}
                    <textarea type="text" id='content' bind:value={newAccom.content} rows="5" maxlength="1200" on:focus={()=>{accomContentHighlighted = true}} on:blur={()=>{accomContentHighlighted = false}}></textarea>
                </div>
            </div>

            <button class='centered blue' type='submit' on:click|preventDefault={()=> {save(); accomCreatorOpen = false} }>OK</button>
        </form>
    </Modal>
{/if}

{#if showConfirmModal}
    <Modal on:forceClose={()=>{ showConfirmModal = false; toDelete = "" }}>
        <h3>Are you sure?</h3>
        <p>If you delete this {formatText($settings.services, false, false)}, it will not be recoverable. This will not affect {formatText($settings.students, false, false)}'s committed {formatText($settings.services, false, false)} history.</p>
        <div class="align-ends">
            <button class='centered' type='submit' on:click|preventDefault={()=> { deleteConfirm(toDelete) }}>Delete it</button>
            <button class='centered blue' type='submit' on:click|preventDefault={()=> {  showConfirmModal = false; toDelete = "" } }>Never mind</button>
        </div>
    </Modal>
{/if}

{#if showDeleteConfirmModal}
    <Modal on:forceClose={()=>{ showDeleteConfirmModal = false }}>
        <h3>All done!</h3>
        <p>The indicated {formatText($settings.services, false, false)} has been removed from the list.</p>
        <button class='centered blue' type='submit' on:click|preventDefault={()=> {  showDeleteConfirmModal = false } }>OK</button>
    </Modal>
{/if}