<script>
    import { onMount } from "svelte";
    // import QR from 'svelte-qr';
    import { ndk } from './lib/store';
    import { NDKNip07Signer } from "@nostr-dev-kit/ndk";

    let hasNostrNip07 = true;
    let publicKey = null;
    let nip46URI;
    let adapterConfig;
    let type = 'nip07'; //localStorage.getItem('nostrichat-type');

    onMount(() => {
        setTimeout(() => {
            if (type === 'nip07') {
                useNip07();
            } else if (type === 'nip-46') {
                useNip46();
            }
        }, 500);
    });

    async function useNip07() {
        try {
            $ndk.signer = new NDKNip07Signer();
            await $ndk.signer.user();
        } catch (e) {
            hasNostrNip07 = false;
            alert("You don't seem to have a NIP-07 nostr extension; we can't do highlights without it yet")
            console.error(e);
        }
    }

    import { generatePrivateKey, getPublicKey } from 'nostr-tools';
    import { Connect, ConnectURI } from '@nostr-connect/connect';

    async function useDiscardableKeys() {
        // chatAdapter.set(new NstrAdapterDiscadableKeys(adapterConfig))
    }


    async function useNip46() {
        let key = localStorage.getItem('nostrichat-nostr-connect-key');
        let publicKey = localStorage.getItem('nostrichat-nostr-connect-public-key');

        if (key) {
            chatAdapter.set(new NstrAdapterNip46(publicKey, key, adapterConfig))
            return;
        }

        key = generatePrivateKey();

        const connect = new Connect({ secretKey: key, relay: 'wss://nostr.vulpem.com' });
        connect.events.on('connect', (connectedPubKey) => {
            localStorage.setItem('nostrichat-nostr-connect-key', key);
            localStorage.setItem('nostrichat-nostr-connect-public-key', connectedPubKey);
            localStorage.setItem('nostrichat-type', 'nip-46');

            console.log('connected to nostr connect relay')
            publicKey = connectedPubKey;
            chatAdapter.set(new NstrAdapterNip46(publicKey, key))
            nip46URI = null;
        });
        connect.events.on('disconnect', () => {
            console.log('disconnected from nostr connect relay')
        })
        await connect.init();

        let windowTitle, currentUrl, currentDomain;

        try {
            windowTitle = window.document.title || 'Nostrichat';
            currentUrl = new URL(window.location.href);
            currentDomain = currentUrl.hostname;
        } catch (e) {
            currentUrl = window.location.href;
            currentDomain = currentUrl;
        }

        const connectURI = new ConnectURI({
            target: getPublicKey(key),
            relay: 'wss://nostr.vulpem.com',
            metadata: {
                name: windowTitle,
                description: '🔉🔉🔉',
                url: currentUrl,
            },
        });

        nip46URI = connectURI.toString();
    }
</script>

<style>
	@tailwind base;
	@tailwind components;
	@tailwind utilities;
</style>