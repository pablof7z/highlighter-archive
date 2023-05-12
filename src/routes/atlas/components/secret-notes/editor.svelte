<script lang="ts">
    import ndk from '$lib/stores/ndk';
    import { NDKEvent, NDKPrivateKeySigner, type NostrEvent } from "@nostr-dev-kit/ndk";
    import { Editor, Viewer } from 'bytemd';
    import gfm from '@bytemd/plugin-gfm'
    import 'bytemd/dist/index.css';
    import { filterFromNaddr, idFromNaddr } from '$lib/utils';
    import { onMount } from 'svelte';

    export let event: NDKEvent;
    export let signer: NDKPrivateKeySigner;

    let longFormEvent: NDKEvent | null | undefined = undefined;
    let value: string;

    const plugins = [
        gfm(),
        // Add more plugins here
    ]

    function handleChange(e: any) {
        value = e.detail.value
    }

    onMount(async () => {
        if (!signer) {
            signer = new NDKPrivateKeySigner(event.content.key);
        }
        const signerUser = await signer.user();
        console.log(`signer private key`, signer.privateKey, signerUser.hexpubkey());


        const filter = filterFromNaddr(event.content.event);
        console.log(filter);
        longFormEvent = await $ndk.fetchEvent(filter);

        console.log(longFormEvent, signer);

        if (longFormEvent && longFormEvent.content.length > 0) {
            try {
                await longFormEvent.decrypt(signerUser, signer);
            } catch (e) {
                console.error(e);
            }
            value = longFormEvent.content;
        }
    })

    async function save() {
        const signerUser = await signer.user();
        const newEvent = new NDKEvent($ndk, {
            kind: 30023,
            ...(longFormEvent||{}),
            content: value,
            created_at: Math.floor(Date.now() / 1000),
            pubkey: signerUser.hexpubkey(),
        } as NostrEvent);

        console.log({signer});
        // await newEvent.encrypt(signerUser, signer);
        await newEvent.sign(signer);
        await newEvent.publish();
    }
</script>

<div>
    <Editor bind:value={value}  {plugins} on:change={handleChange} />
</div>


{value}

{JSON.stringify(event.content)}

<button on:click={save}>Save</button>