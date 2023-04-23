<script lang="ts">
    import { Editor, Viewer } from 'bytemd';
    import gfm from '@bytemd/plugin-gfm'

    let value: string;
    const plugins = [
        gfm(),
        // Add more plugins here
    ]

    function handleChange(e) {
        value = e.detail.value
    }
</script>

<div class="text-red-500 text-xl font-light">
    <span class="font-bold">Saving is not ready!</span>
    <div class="text-sm text-zinc-500">don't write anything important because it won't be saved.</div>
</div>

<div>
    <Editor {value}  {plugins} on:change={handleChange} />
</div>