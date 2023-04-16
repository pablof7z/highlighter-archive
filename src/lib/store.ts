import { writable } from 'svelte/store';
import NDK from '@nostr-dev-kit/ndk';

export const ndk = writable(new NDK({
    explicitRelayUrls: [ 'ws://localhost:8080', 'wss://purplepag.es', 'wss://nos.lol']
}));