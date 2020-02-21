<script>
    import { fly, scale } from 'svelte/transition'
    import {onMount} from 'svelte'
    import { settings, formatText } from './store.js'
    import Quill from 'quill'
    import 'quill/dist/quill.core.css'
    import 'quill/dist/quill.snow.css'
    import QuillBetterTable from 'quill-better-table'
    import "quill-better-table/dist/quill-better-table.css"
    import { createEventDispatcher } from 'svelte';

    const dispatch = createEventDispatcher()
    export let pdfSettings
    export let content

    let variablesList = []
    if(pdfSettings.editing == 'body') {
        variablesList = ['First name', 'Last name', 'Date issued', formatText($settings.services, true, true), formatText($settings.students, false, true) + " notes", "Current page"]
    }
    else if(pdfSettings.editing == 'header' || pdfSettings.editing == 'footer') {
        variablesList = ['First name', 'Last name', 'Date issued', "Current page"]
    }

    Quill.register({
        'modules/better-table': QuillBetterTable
    }, true)

    let quillOptions = {
        modules: {
            table: false,
            'better-table': {
                operationMenu: {
                    'insertColumnRight': true
                },
                keyboard: {
                    bindings: QuillBetterTable.keyboardBindings
                }
            },
            toolbar: {
                container: "#toolbar-container",
                // handlers: {
                //     'table': value => {
                //         let table = editor.getModule('better-table')

                //         value = value.split('x')
                //         table.insertTable(parseInt(value[0]), parseInt(value[1]))

                //         let tds = document.querySelectorAll('.ql-editor td')
                //         tds.forEach(td => {
                //             td.style = "border-color: gray; border-width: 1px; border-style: dotted;"
                //         })
                //     },

                //     'variables': value => {
                //         if (value) {
                //             const cursorPosition = editor.getSelection().index;
                //             editor.insertText(cursorPosition, '{$' + value + '}');
                //             editor.setSelection(cursorPosition + value.length + 3);
                //         }
                //     },
                // }
            }
        },
        placeholder: pdfSettings.placeholder,
        theme: 'snow'
    }

    let clearData = ()=> {
        document.querySelector('.ql-editor').innerHTML = ""
        content = ""
    }

    let editor
    let table
    let addTable

    onMount(()=>{
        editor = new Quill('#editor', quillOptions)
        table = editor.getModule('better-table')

        const tablePickerItems = Array.prototype.slice.call(document.querySelectorAll('.ql-table .ql-picker-item'));
        tablePickerItems.forEach(item => item.textContent = item.dataset.value);
        
        const variableItems = Array.prototype.slice.call(document.querySelectorAll('.ql-variables .ql-picker-item'));
        variableItems.forEach(item => item.textContent = item.dataset.value);
        
        document.querySelector('style').innerHTML += ".ql-table .ql-picker-label:before, .ql-variables .ql-picker-label:before, .ql-table { content: 'Grid'; display: inline-block; line-height: 22px; margin-right: 2.5em; } .ql-variables .ql-picker-label:before { content: 'Variables' } .qlbt-col-tool { z-index: initial; } .quill-better-table-wrapper { max-width: 100%; }"
        document.querySelector('.ql-editor').addEventListener('click', ()=> {
            let tds = document.querySelectorAll('.ql-editor td')
            tds.forEach(td => {
                td.style = "border-color: gray; border-width: 1px; border-style: dotted;"
            })
        })

        // document.querySelector('.ql-editor').innerHTML = content
        editor.setContents(content)
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

    .align-right {
        text-align: right;
    }

    .align-right button {
        display: inline;
    }

    .toolbar-block {
        float: left;
        margin-right: 0;
    }

    .toolbar-block + .toolbar-block {
        margin-left: 1em;
        padding-left: 1em;
        border-left-style: solid;
        border-left-width: 1px;
        border-left-color: lightgray;
    }
</style>

<h3>Editing "{pdfSettings.editing}"</h3>
{#if pdfSettings.editing == 'header'}
    <p>The header appears at the top of each page.</p>
{:else if pdfSettings.editing == 'footer'}
    <p>The footer appears at the bottom of each page.</p>
{/if}

<div id="container">
    <div id="toolbar-container">
        <select class="ql-header toolbar-block"></select>
        <span class="ql-formats toolbar-block">
            <button class="ql-list" value="ordered" />
            <button class="ql-list" value="bullet" />
            <button class="ql-indent" value="-1" />
            <button class="ql-indent" value="+1" />
        </span>
        <span class="toolbar-block">
            <button class="ql-bold" data-toggle="tooltip" data-placement="bottom" title="Bold"/>
            <button class="ql-italic" data-toggle="tooltip" data-placement="bottom" title="Italic"/>
            <button class="ql-underline" data-toggle="tooltip" data-placement="bottom" title="Underline"/>
        </span>
        <span class="toolbar-block">
            <button class='ql-pagebreak' value='pagebreak'>
                <svg viewBox="0 0 18 18">
                    <g transform="translate(0,-279)" fill="none">
                        <path class="ql-stroke" d="m15.214 288.31v-7.1582h-9.5247l-3.2559 3.7008v3.4573" stroke-linejoin="round"/>
                        <path class="ql-stroke" d="m2.4588 285.6h4.0524v-4.3986" stroke-linejoin="round"/>
                        <path class="ql-stroke" d="m1.9054 292.61 13.856-0.0539" stroke-dasharray="1, 3" stroke-dashoffset="3.6"/>
                    </g>
                </svg>
            </button>
            <button></button>
            <button></button>
        </span>
    </div>

    <div id='editor'></div>
</div>

<div class="align-right">
    <button class='blue' type='submit' on:click|preventDefault={()=> {dispatch('save', editor.getContents()); dispatch('forceClose')} }>Save</button>
    <button type='submit' on:click|preventDefault={()=> {dispatch('forceClose')} }>Cancel</button>
</div>
<div class="align-right">
    <button type='submit' on:click|preventDefault={clearData}>Clear</button>
</div>