<script>
    import { fly, scale } from 'svelte/transition'
    import {onMount, onDestroy} from 'svelte'
    import { settings, formatText } from './store.js'
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher()
    export let pdfSettings

    let editor
    let table
    let addTable
    let tiny = tinymce
    export let content

    function insertVariable(content) {
        tiny.get("editor").execCommand("mceInsertContent", false, content)
    }

    onMount(()=>{
        tinymce.init({
            selector: "#editor",
            plugins:  `
                paste autolink directionality code 
                image link media 
                codesample table hr anchor toc insertdatetime advlist 
                lists imagetools textpattern
            `,
            menubar: false,
            toolbar: `
                undo redo | fontselect fontsizeselect forecolor
                formatselect blockquote | bold italic underline | 
                alignleft aligncenter alignright | hr insertdatetime | link image | 
                outdent indent | numlist bullist | table tabledelete | 
                tableprops tablerowprops tablecellprops | 
                tableinsertrowbefore tableinsertrowafter tabledeleterow | 
                tableinsertcolbefore tableinsertcolafter tabledeletecol
            `,
            placeholder: pdfSettings.placeholder,
            inline_styles: true
        })
    })

    onDestroy(()=> {
        tiny.get("editor").destroy()
    })
        
</script>

<style>
    #container {
        margin-top: 2em;
        width: 612pt;
    }

    #editor {
        background-color: white;
        min-height: 100pt;
        max-height: 300pt;
        overflow-y: auto;
    }

    .inline button {
        display: inline;
        margin: 1em 0;
    }

    .variableButton {
        padding: .25em .5em;
        background-color: gray;
        color: white;
        font-weight: bold;
        border-radius: 5px;
        margin: 0 .25em;
    }

    .variableButton:hover {
        cursor: pointer;
        background-color: lightgray;
        color: black;
    }
</style>

<!-- <h3>Editing "{pdfSettings.editing}"</h3>
{#if pdfSettings.editing == 'header'}
    <p>The header appears at the top of each page.</p>
{:else if pdfSettings.editing == 'footer'}
    <p>The footer appears at the bottom of each page.</p>
{/if} -->

<p>Variables: 
    <span on:click={()=> {insertVariable("${first name}")}} class='variableButton'>First name</span>
    <span on:click={()=> {insertVariable("${last name}")}} class='variableButton'>Last name</span>
    <span on:click={()=> {insertVariable("${id}")}} class='variableButton'>ID</span>
    <span on:click={()=> {insertVariable("${date}")}} class='variableButton'>Date</span>
    <span on:click={()=> {insertVariable("${" + formatText($settings.services, true, false) + "}")}} class='variableButton'>{formatText($settings.services, true, true)}</span>
    <span on:click={()=> {insertVariable("${" + formatText($settings.students, false, false) + " notes}")}} class='variableButton'>{formatText($settings.students, false, true)} notes</span>
</p>

<div id="container">
    <div id='editor'>{@html content}</div>
</div>

<div class='inline'>
    <button class='blue' type='submit' on:click|preventDefault={()=> {dispatch('save', tiny.get("editor").getContent()); dispatch('forceClose')} }>Save</button>
    <button class='blue' type='submit' on:click|preventDefault={()=> {dispatch('preview')}}>Preview</button>
    <button type='submit' on:click|preventDefault={()=> {dispatch('forceClose')} }>Cancel</button>
</div>