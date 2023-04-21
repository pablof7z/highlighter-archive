import Widget from './Widget.svelte';


var div = document.createElement('DIV');
// var script = document.currentScript;
let relays; // = script.getAttribute('data-relays');
// script.parentNode.insertBefore(div, script);
document.body.appendChild(div);

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'https://zapworthy.com/public/bundle.css';

// Append the link element to the head of the page
document.head.appendChild(link);

if (!relays) {
	relays = 'wss://relay.f7z.io,wss://nos.lol,wss://relay.nostr.info,wss://nostr-pub.wellorder.net,wss://relay.current.fyi,wss://relay.nostr.band'
}

relays = relays.split(',');

const embed = new Widget({
	target: div,
	props: {
		relays
	},
});
