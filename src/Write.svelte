<script>
    import { onMount } from 'svelte'
    import { fly, scale } from 'svelte/transition'
    import SortableList from 'svelte-sortable-list'
    import { cubicOut } from "eases-jsnext"
    import { abbreviate, saveLOA, loadLOA, searchLOA, loadAccommodations} from './logic/data.js'
    import { settings, formatText } from './store.js'

    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher()

    import Datepicker from 'svelte-calendar'
    import Modal from "./widgets/Modal.svelte"

    //This takes element position into account
    function flyModified(
        node,
        {
            delay = 0,
            duration = 400,
            easing = cubicOut,
            x = 0,
            y = 0,
            position = "relative"
        }
    ) {
        const style = getComputedStyle(node);
        const opacity = +style.opacity;
        const transform = style.transform === "none" ? "" : style.transform;

        return {
        delay,
        duration,
        easing,
        css: t => `
            transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
            opacity: ${t * opacity};
            position: ${position};`
        };
    }

    class extDate extends Date {
        addDays(days) {
            let date = new extDate(this.valueOf())
            date.setDate(date.getDate() + days)
            return date
        }
    }

    let LOAnew = true
    let abs1 = false
    let abs2 = false

    let showSearchModal = false
    let showSearchListModal = false
    let showOverwriteModal = false
    let showSavedModal = false
    let showFormErrorModal = false
    let showAccomsModal = false

    let searchResults = []

    let student = {
        fname: "",
        lname: "",
        _id: ""
    }

    let searchStud = {
        fname: "",
        lname: "",
        _id: ""
    }

    let accoms = []
    let customAccoms = []
    let studentNotes = ""
    let dateIssued = new Date(Date.now())
    let dateIssuedNext = dateIssued
    $: dateIssuedNext = new extDate(dateIssued).addDays(1)
    let dateUpdated = new Date(Date.now())

    let sortAccoms = ev=> { selectedAccoms = ev.detail }

    $: selectedAccoms = [
        ...(accoms.length ? accoms.filter((accom)=>{ return accom.selected === true }) : []),
        ...customAccoms.filter((accom)=>{ return accom.selected === true })
    ]

    let studentNotesHighlighted = false

    let months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "November",
        "December"
    ]

    let style = "margin: 0;"
    let studentNotesTextarea = null

    let writeNewLOA = ()=> {
        showSearchModal = false
        clear()        
    }

    let searchForStudent = ()=> {
        searchStud = {
            fname: "",
            lname: "",
            _id: ""
        }
        showSearchModal = true
    }
    
    let save = (upsert=false)=> {
        //Trim and uc relevant form fields
        student.lname = student.lname.trim()
        student.fname = student.fname.trim()
        student.lname = student.lname.substr(0,1).toUpperCase() + student.lname.substr(1)
        student.fname = student.fname.substr(0,1).toUpperCase() + student.fname.substr(1)

        //Validate form first!
        if(student.fname.length < 2 ||
            student.lname.length < 2 ||
            student._id.length < 2 ||
            accoms.length < 1
        )
        {
            showFormErrorModal = true
            return
        }

        if(!upsert) {
            loadLOA(student, $settings.databasedir).then((existing)=>{
                if(existing != null) {
                    showOverwriteModal = true
                }
                else {
                    saveLOA({ student, accoms: selectedAccoms, studentNotes, dateUpdated, dateIssued }, $settings.databasedir).then(()=>{
                        showSavedModal = true
                    })
                }
            })
        }
        else saveLOA({ student, accoms: selectedAccoms, studentNotes, dateUpdated, dateIssued }, $settings.databasedir).then(()=>{
            showSavedModal = true
        })
        .catch(e=>{ alert(e) })
    }

    let endSave = ()=> {
        clear()
        showSavedModal = false
    }

    let loadStudent = (inputstudent)=> {
        loadLOA(inputstudent, $settings.databasedir).then((result)=>{
            student = result.student || {}

            //Value to store accommodations not in db (custom)
            customAccoms = []

            //Check through accommodations list and set selected if found in result.accoms
            accoms.forEach((accom)=>{
                accom.selected = (()=> { 
                    let returnVal = false
                    if(result.accoms) {
                        result.accoms.forEach((raccom)=>{
                            if(accom._id == raccom._id) {
                                returnVal = true
                            }
                        })
                    }
                    return returnVal
                })()
            })

            //Check through loaded accoms and add to customAccoms if necessary
            result.accoms.forEach((raccom)=>{
                if(/CUSTOM-/.test(raccom._id)) {
                    customAccoms.push({...raccom, selected: true})
                }
            })

            selectedAccoms = [...customAccoms, ...accoms.filter((accom)=>{ return accom.selected === true })]
            studentNotes = result.studentNotes || ""
            dateIssued = result.dateIssued || new Date()
            dateUpdated = result.dateUpdated || new Date()

            LOAnew = false
            showSearchListModal = false
        })
    }

    let search = ()=> {
        searchLOA(searchStud, $settings.databasedir).then(
            (value)=> {
                searchResults = value
                showSearchModal = false
                showSearchListModal = true
            }
        )
    }

    let clear = ()=> {
        student = {
            fname: "",
            lname: "",
            _id: ""
        }

        accoms.forEach((accom)=> {
            accom.selected = false
        })
        selectedAccoms = []
        studentNotes = ""

        customAccoms = []

        LOAnew = true

        dateIssued = new Date(Date.now())
        dateUpdated = new Date(Date.now())

        dispatch('scrollUp')
    }

    onMount(()=> {
        loadAccommodations($settings.databasedir).then((loadedAccoms)=>{
            accoms = loadedAccoms
        })
    })

    let accomCreatorOpen = false
    let accomContentHighlighted = false
    let newAccom = {}

    let addCustomAccom = ()=> {
        showAccomsModal = false
        newAccom = {
            name: "",
            content: "",
            selected: true
        }
        accomCreatorOpen = true
    }

    let setCustomAccom = ()=> {
        accomCreatorOpen = false
        customAccoms.push({...newAccom, _id: "CUSTOM-" + accoms.length + 1})
        customAccoms = customAccoms
    }

</script>

<style>

    input {
        z-index: 0;
    }

    button.just-text {
        background-color: transparent;
        border: none;
        margin: 0; padding: 0;
        font-size: 1em;
    }

    textarea {
        width: 100%;
        display: block;
    }

    #student-notes-container {
        position: relative;
    }

    .inline-buttons button {
        display: inline;
    }

    .selectables li {
        cursor: pointer;
        color: #C33C54;
    }

    .selectables li:hover {
        text-decoration: underline;
    }

    .switchable {
        width: 100%;
        top: 0;
        left: 0;
    }

    .switchable h2 {
        margin-top: 0;
        padding-top: 1.5em;
    }

    #accoms-modal-list {
        display: grid;
        grid-template-columns: 1fr 1fr;
        overflow-y: scroll;
        list-style: none;
        grid-gap: 1em;
        padding-left: 0;
        min-width: 30em;
    }

    #accoms-modal-list li {
        background-color: #C33C54;
        color: white;
        padding: .5em;
        text-align: center;
        border-radius: 5px;
        cursor: pointer;
        width: 30em;
        max-width: 40vw;
    }

    #accoms-modal-list li:hover {
        filter: brightness(1.2);
    }

    #accoms-modal-list li.selected {
        background-color: #8EE3EF;
        color: #37718E;
        font-weight: bold;
    }

    .accommodation {
        cursor: move;
    }

    #new-accom-form textarea { display: block; margin: 0; min-height: 15vh; }

    .form-halves2 {
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
    {#if LOAnew}
        <div class='switchable' in:fly|local={{x: 100, delay: 500}} out:flyModified|local={{x: 100, position: 'absolute'}}>
            <h2>Issue a New {formatText($settings.abbrev, false, false, true)}</h2>
            <p class='mt-0'>...or <button class='just-text' on:click={searchForStudent}>search for an existing one</button>.</p>
        </div>
    {:else}
        <div class='switchable' in:fly|local={{x: 100, delay: 500}} out:flyModified|local={{x: 100, position: 'absolute'}}>
            <h2>Edit {student.fname}'s {formatText($settings.abbrev, false, false, true)}</h2>
            <p class='mt-0'>...or <button class='just-text' on:click={writeNewLOA}>write a new one</button>.</p>
        </div>
    {/if}    
    <form>
        <div class="form-halves">
            <label for="issued">Date</label>
            <Datepicker style={style} end={new Date(Date.now())} bind:selected={dateUpdated}>
                <input type='text' value={months[dateUpdated.getMonth()] + " " + dateUpdated.getDate() + ", " + dateUpdated.getFullYear()}>
            </Datepicker>
        </div>

        <h3>{formatText($settings.students, false, true)} Information</h3>
        <div class="form-halves">
            <label for="fname">First Name</label>
            <input type="text" id='fname' bind:value={student.fname} maxlength='100'>
        </div>
        <div class="form-halves">
            <label for="lname">Last Name</label>
            <input type="text" id='lname' bind:value={student.lname} maxlength='100'>
        </div>
        <div class="form-halves">
            <label for="sid">ID#</label>
            <input type="text" id='sid' bind:value={student._id} maxlength='20'>
        </div>
    
        <div style='position: relative;'>
            <h3>Approved {formatText($settings.services, true, true)}</h3>
            <ul id='accoms-list'>
                {#if selectedAccoms.length > 0}
                    <SortableList 
                        list={selectedAccoms} 
                        key="_id"
                        on:sort={sortAccoms} 
                        let:item
                        let:index>
                        <li class="whitebox accommodation">
                            <h4>{item.name}</h4>
                            <p>{abbreviate(item.content, 150)}</p>
                            <div class='close' on:click={()=>{ item.selected = false; accoms = accoms }}>&times;</div>
                        </li>
                    </SortableList>
                    <li><a href='addAccom' on:click|preventDefault={()=>{ showAccomsModal = true }}>Add more</a></li>
                {:else}
                    <li>No {formatText($settings.services, true, false)} listed - <a href='addAccom' on:click|preventDefault={()=>{ showAccomsModal = true }}>add some!</a></li>
                {/if}
            </ul>
        </div>
    
        <h3>{formatText($settings.students, false, true)} Notes</h3>
        <div id='student-notes-container'>
            {#if studentNotesHighlighted}
                <div transition:scale class='remaining-characters'>
                    { studentNotes ? 250 - studentNotes.length : 250}
                </div>
            {/if}
            <textarea bind:this={studentNotesTextarea} name="student-notes" id="student-notes" rows="5" maxlength="250" on:focus={()=>{studentNotesHighlighted = true}} on:blur={()=>{studentNotesHighlighted = false}} bind:value={studentNotes}></textarea>
        </div>

        <div class="inline-buttons">
            <button class='blue' type='submit' on:click|preventDefault={()=>{save()}}>Issue</button>
            <button type='submit' on:click|preventDefault={()=>{clear()}}>Clear</button>
        </div>
    </form>


    <!-- MODAL -->
    {#if showSearchModal}
        <Modal on:forceClose={()=>{ showSearchModal = false; }}>
            <h3>Find a {formatText($settings.students, false, true)}</h3>
            <p style="max-width: 30em;">Search by ID or first and last name. You can leave out parameters, but you must spell names correctly and fully match names and IDs (case-sensitive!).</p>
            <form>
                <div class="form-halves">
                    <label for="search-id">ID#</label>
                    <input id='search-id' type="text" bind:value={searchStud._id} maxlength='20'>
                </div>
                <div class="form-halves">
                    <label for="search-fname">First Name</label>
                    <input id='search-fname' type="text" bind:value={searchStud.fname} maxlength='100'>
                </div>
                <div class="form-halves">
                    <label for="search-lname">Last Name</label>
                    <input id='search-lname' type="text" bind:value={searchStud.lname} maxlength='100'>
                </div>

                <button class='centered blue' type='submit' on:click|preventDefault={search}>Find them!</button>
            </form>
        </Modal>
    {/if}

    {#if showOverwriteModal}
        <Modal on:forceClose={()=>{ showOverwriteModal = false }}>
            <h3>Found an existing {formatText($settings.students, false, false)}!</h3>
            <p>A {formatText($settings.students, false, false)} with that ID already exists. Do you want to issue a new {formatText($settings.abbrev, false, false, true)} for them?</p>
                <div class="align-ends">
                    <button class='centered' type='submit' on:click|preventDefault={()=> {save(true); showOverwriteModal = false} }>Yes</button>
                    <button class='centered blue' type='submit' on:click|preventDefault={()=> {showOverwriteModal = false} }>No</button>
                </div>
        </Modal>
    {/if}

    {#if showSearchListModal}
        <Modal on:forceClose={()=> { showSearchListModal = false; }}>
            <h3>Results</h3>
            {#if searchResults.length == 0}
                <p>No results were found. :-(</p>
            {:else}
                <p>We found the following {formatText($settings.students, true, false)}:</p>
                <ul class='selectables'>
                {#each searchResults as result}
                    <li on:click={()=>{ loadStudent(result.student) }}>{result.student.lname}, {result.student.fname} - {result.student._id}</li>
                {/each}
                </ul>
            {/if}
            <button class='centered' type='submit' on:click|preventDefault={()=> { showSearchListModal = false; showSearchModal = true; }}>Back</button>
        </Modal>
    {/if}

    {#if showSavedModal}
        <Modal on:forceClose={()=> { endSave() }}>
            <h3>Saved!</h3>
            <p>You saved {student.fname} {student.lname}'s {formatText($settings.abbrev, false, false, true)}.</p>
            <button class='centered blue' type='submit' on:click|preventDefault={ ()=> {endSave()} }>OK</button>
        </Modal>
    {/if}

    {#if showFormErrorModal}
        <Modal on:forceClose={()=> { showFormErrorModal = false }}>
            <h3>Whoops!</h3>
            <p>Looks like you didn't fill in all the {formatText($settings.students, false, false)}'s information. Also make sure that you've added all the {formatText($settings.services, true, false)} the {formatText($settings.students, false, false)} needs.</p>
            <button class='centered blue' type='submit' on:click|preventDefault={ ()=> {showFormErrorModal = false} }>OK</button>
        </Modal>
    {/if}

    {#if showAccomsModal}
        <Modal on:forceClose={()=>{ showAccomsModal = false }}>
            <h3>Select {formatText($settings.services, true, true)}</h3>
            <ul id='accoms-modal-list'>
                {#each [...accoms, ...customAccoms] as accom}
                    <li class:selected={accom.selected} on:click={()=>{accom.selected = !accom.selected }} title={accom.name}>{abbreviate(accom.name, 100)}</li>
                {/each}
            </ul>
            <p>...or <a href="custom" on:click|preventDefault={addCustomAccom}>add a custom {formatText($settings.services, false, false)}.</a></p>
            <button class='centered blue' type='submit' on:click|preventDefault={ ()=> {showAccomsModal = false} }>OK</button>
        </Modal>
    {/if}

    {#if accomCreatorOpen}
        <Modal on:forceClose={()=>{ accomCreatorOpen = false; newAccom = { _id: "", name: "", content: "" } }}>
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

                <button class='centered blue' type='submit' on:click|preventDefault={()=> {setCustomAccom()} }>OK</button>
            </form>
        </Modal>
    {/if}
</div>