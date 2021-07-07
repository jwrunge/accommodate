<script>
    import { onMount } from 'svelte'
    import Write from './Write.svelte'
    import Students from './Students.svelte'
    import Accommodations from './Accommodations.svelte'
    import Settings from './Settings.svelte'
    import Record from './Record.svelte'
    import LOATemplate from './LOATemplate.svelte'
    import {settings, formatText} from './store.js'
    import Modal from './widgets/Modal.svelte'

    let showAuthModal = false
    let showPassModal = false

    let curPassword = ""
    let pagePasswords = ""
    let pageBuffer = ""

    let page = {
        '#write': Write,
        "#students": Students,
        '#accommodations': Accommodations,
        '#record': Record,
        '#settings': Settings,
        "#pdf": LOATemplate,
    }

    let viewarea
    let curPage = ""

    let checkForPagePassword = (page)=> {
        let pwords = []

        if($settings.passwords && Array.isArray($settings.passwords)) {
            $settings.passwords.forEach(pw=>{
                if(pw) {
                    pw.pages.forEach(p=>{
                        if(p.value == page) pwords.push(pw.password)
                    })
                }
            })
        }

        return pwords
    }

    let changePage = (page, prompt = true)=> {
        pagePasswords = checkForPagePassword(page)
        showPassModal = false

        //Check if the page is included in any password pages list
        if(pagePasswords.length > 0) {
            if(curPassword && pagePasswords.includes(curPassword))
                curPage = page
            else if(prompt) { 
                showPassModal = true
                pageBuffer = page
            }
            else {
                showAuthModal = true
                window.location.hash =  ""
            }
        }
        else curPage = page
    }

    window.onhashchange = ()=>{
        changePage(window.location.hash.split('/')[0])
    }

    onMount(()=> {
        window.location.hash = '#'
        setTimeout(()=>{
            window.location.hash = '#write'
        }, 300)

        changePage('#write')
    })
</script>

<style>
    #main {
        display: grid;
        width: 100%; height: 100vh;
        grid-template-columns: auto 1fr;
        grid-template-rows: auto 1fr;
        align-content: stretch;
        grid-column-gap: 2em;
        margin: 0; padding: 0;
    }

    #main .inner {
        padding-bottom: 4em;
        background-image: url("./images/hexagons.svg");
        background-position: 0 5%;
        overflow-y: scroll;
        overflow-x: hidden;
    }

    @media screen and (min-width: 1000px) {
        #main .constrain {
            margin-left: 10%;
        }
    }

    #header {
        grid-column: 1 / span 2;
        padding: 0;
        text-align: center;
        color: #C33C54;
        background-color: #8EE3EF;
        background: linear-gradient(0deg, #6adfee 0%,rgb(167, 230, 238) 100%);

        display: flex;
        align-items: center;
        justify-content: center;

        box-shadow: 0 0 3px rgba(0,0,0,.5);
        z-index: 1;
    }

    #header h1 {
        margin: .5em 0;
    }

    #logo {
        max-width: 3em;
        max-height: 3em;
        margin-right: 1em;
    }

    nav {
        position: sticky;
        top: 2em;
        background-color: #254E70;
        width: 20em;
        max-width: 25vw;
        color: #8EE3EF;
        z-index: 1;
    }

    nav li a {
        display: block;
        font-weight: bold;
        color: #8EE3EF;
        padding: .5em;
        border-radius: .25em;
    }

    nav ul {
        list-style-type: none;
        margin: 0; padding: 2em 1em;
        position: relative;
        margin-top: 1em;
    }

    nav li {
        margin: .5em 0;
        border-radius: .25em;
    }

    nav li.active {
        background-color: #37718E;
    }

    nav li:hover {
        background-color: #8EE3EF;
        color: #C33C54;
    }

    nav li:hover a {
        color: #C33C54;
    }

    #menucurl {
        width: 100%;
        position: absolute;
        top: 0;
        left: -1px;
    }

    .constrain {
        max-width: 40em;
    }
</style>

<section id="main">
    <div id="header">
        <svg id='logo' version="1.1" xmlns="http://www.w3.org/2000/svg" width="174" height="200" viewbox="0 0 173.20508075688772 200" style="filter: drop-shadow(rgba(255, 255, 255, 0.5) 0px 0px 10px);"><path fill="#C33C54" d="M86.60254037844386 0L173.20508075688772 50L173.20508075688772 150L86.60254037844386 200L0 150L0 50Z"></path></svg>
        <h1>Accommodate</h1>
    </div>
    <nav>
        <svg id='menucurl' viewBox="0 0 200 50"><g transform="translate(0,-247)"><path d="M 0,247 H 200 C 87.745309,251.08461 12.341004,241.11661 0,297 Z" style="opacity:1;fill:#6adfee;fill-opacity:1;stroke:none;stroke-width:0.26499999;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1"/></g></svg>
        <ul>
            <li class:active={curPage == '#write'}><a href='#write'>Write {formatText($settings.abbrev, false, false, true)}</a></li>
            <li class:active={curPage == '#students' || curPage == '#record'}><a href='#students'>{formatText($settings.students, true, true)}</a></li>
            <li class:active={curPage == '#accommodations'}><a href='#accommodations'>{formatText($settings.services, true, true)}</a></li>
            <li class:active={curPage == '#pdf'}><a href='#pdf'>{formatText($settings.abbrev, false, false, true)} Template</a></li>
            <li class:active={curPage == '#settings'}><a href='#settings'>Settings</a></li>
            <!-- <li class:active={curPage == '#reports'}><a href='#reports'>Reports</a></li> -->
        </ul>
    </nav>
    <div class="inner" bind:this={viewarea}>
        <div class="constrain">
            <svelte:component this={page[curPage]} on:scrollUp={()=>{ viewarea.scrollTop = 0 }}/>
        </div>
    </div>
</section>

{#if showAuthModal}
    <Modal on:forceClose={()=>{ showAuthModal = false }}>
        <h3>Unauthorized</h3>
        <p>You are not authorized to view this content based on the password you provided.</p>
        <button class='centered blue' type='submit' on:click|preventDefault={ ()=> {showAuthModal = false} }>OK</button>
    </Modal>
{/if}

{#if showPassModal}
    <Modal on:forceClose={()=>{ showPassModal = false }}>
        <h3>Password</h3>
        <p>Enter a password to view this content.</p>
        <div class="inline centered">
            <input type="password" bind:value={curPassword}><br>
            <button class='blue' type='submit' on:click|preventDefault={ ()=> { changePage(pageBuffer, false) } }>OK</button>
            <button type='submit' on:click|preventDefault={ ()=> {showPassModal = false} }>Cancel</button>
        </div>
    </Modal>
{/if}