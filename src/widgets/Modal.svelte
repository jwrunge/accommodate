<script>
    import {scale, fade} from 'svelte/transition'
    import { createEventDispatcher } from 'svelte';

    const dispatch = createEventDispatcher()
</script>

<style lang='scss' type='text/postcss'>
	.modal-background {
        background-color: #254E70cc;
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
    }

    .modal-inner {
        background-color: white;
        min-width: 20em;
        padding: 1em;
        border-radius: .25em;
        position: relative;
    }

    .modal-inner .inner {
        margin: 0 auto;
    }

    .close {
        position: absolute;
        top: 0;
        right: .5em;
        color: gray;
        font-size: 2em;
        cursor: pointer;
    }

    .close:hover {
        color: #C33C54;
    }
</style>


<div class='modal-background' in:fade={{duration: 300}} out:fade={{duration: 300, delay: 150}}>
    <div class='modal-inner top-border-secondary' on:click|stopPropagation in:scale={{duration: 150, delay: 200}} out:scale={{duration: 150}}>
        <div class='close' on:click={()=>{dispatch('forceClose')}}>&times;</div>
        
        <div class="inner">
            <slot>No content specified</slot>
        </div>
    </div>
</div>