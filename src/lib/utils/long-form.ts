import type NDK from "@nostr-dev-kit/ndk";
import { filterFromNaddr, idFromNaddr } from ".";
import type { NDKEvent, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import { findEphemeralSigner } from "$lib/signers/ephemeral";

export class EncryptedLongForm {
    public title: string;
    public content: string;
    private signer?: NDKPrivateKeySigner;
    private event?: NDKEvent;

    constructor() {
        this.title = '';
        this.content = 'sdsd';
    }

    static async fromEvent(ndk: NDK, nip19: string, event: NDKEvent | null): Promise<EncryptedLongForm> {
        const longForm = new EncryptedLongForm();
        console.log(`loaded event`, event);
        // longForm.title = event["#a"][0];
        // longForm.content = event["#a"][1];
        if (event) longForm.event = event;

        // load the signer
        longForm.signer = await findEphemeralSigner(ndk, ndk.signer!, {
            associatedEventNip19: nip19
        });

        if (!longForm.signer) {
            throw new Error(`Could not find signer for event ${nip19}`);
        }

        return longForm;
    }
}

export async function loadEncryptedLongForm(
    ndk: NDK,
    naddr: string
): Promise<EncryptedLongForm | undefined> {
    const filter = filterFromNaddr(naddr);
    const event = await ndk.fetchEvent(filter);

    console.log(`received`, event);

    return await EncryptedLongForm.fromEvent(ndk, naddr, event);
}