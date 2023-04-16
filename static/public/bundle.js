(function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function get_store_value(store) {
        let value;
        subscribe(store, _ => value = _)();
        return value;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function set_store_value(store, ret, value) {
        store.set(value);
        return ret;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        text.data = data;
    }
    function set_style(node, key, value, important) {
        if (value === null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
     * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
     * it can be called from an external module).
     *
     * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
     *
     * https://svelte.dev/docs#run-time-svelte-onmount
     */
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    let render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = /* @__PURE__ */ Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        // Do not reenter flush while dirty components are updated, as this can
        // result in an infinite loop. Instead, let the inner flush handle it.
        // Reentrancy is ok afterwards for bindings etc.
        if (flushidx !== 0) {
            return;
        }
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            try {
                while (flushidx < dirty_components.length) {
                    const component = dirty_components[flushidx];
                    flushidx++;
                    set_current_component(component);
                    update(component.$$);
                }
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    /**
     * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
     */
    function flush_render_callbacks(fns) {
        const filtered = [];
        const targets = [];
        render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
        targets.forEach((c) => c());
        render_callbacks = filtered;
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            flush_render_callbacks($$.after_update);
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = new Set();
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (const subscriber of subscribers) {
                        subscriber[1]();
                        subscriber_queue.push(subscriber, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.add(subscriber);
            if (subscribers.size === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                subscribers.delete(subscriber);
                if (subscribers.size === 0 && stop) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    var _nodeResolve_empty = {};

    var nodeCrypto = /*#__PURE__*/Object.freeze({
        __proto__: null,
        default: _nodeResolve_empty
    });

    /*! noble-secp256k1 - MIT License (c) 2019 Paul Miller (paulmillr.com) */
    const _0n = BigInt(0);
    const _1n = BigInt(1);
    const _2n = BigInt(2);
    const _3n = BigInt(3);
    const _8n = BigInt(8);
    const CURVE = Object.freeze({
        a: _0n,
        b: BigInt(7),
        P: BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f'),
        n: BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),
        h: _1n,
        Gx: BigInt('55066263022277343669578718895168534326250603453777594175500187360389116729240'),
        Gy: BigInt('32670510020758816978083085130507043184471273380659243275938904335757337482424'),
        beta: BigInt('0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee'),
    });
    function weistrass(x) {
        const { a, b } = CURVE;
        const x2 = mod(x * x);
        const x3 = mod(x2 * x);
        return mod(x3 + a * x + b);
    }
    const USE_ENDOMORPHISM = CURVE.a === _0n;
    class ShaError extends Error {
        constructor(message) {
            super(message);
        }
    }
    class JacobianPoint {
        constructor(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        static fromAffine(p) {
            if (!(p instanceof Point)) {
                throw new TypeError('JacobianPoint#fromAffine: expected Point');
            }
            return new JacobianPoint(p.x, p.y, _1n);
        }
        static toAffineBatch(points) {
            const toInv = invertBatch(points.map((p) => p.z));
            return points.map((p, i) => p.toAffine(toInv[i]));
        }
        static normalizeZ(points) {
            return JacobianPoint.toAffineBatch(points).map(JacobianPoint.fromAffine);
        }
        equals(other) {
            if (!(other instanceof JacobianPoint))
                throw new TypeError('JacobianPoint expected');
            const { x: X1, y: Y1, z: Z1 } = this;
            const { x: X2, y: Y2, z: Z2 } = other;
            const Z1Z1 = mod(Z1 * Z1);
            const Z2Z2 = mod(Z2 * Z2);
            const U1 = mod(X1 * Z2Z2);
            const U2 = mod(X2 * Z1Z1);
            const S1 = mod(mod(Y1 * Z2) * Z2Z2);
            const S2 = mod(mod(Y2 * Z1) * Z1Z1);
            return U1 === U2 && S1 === S2;
        }
        negate() {
            return new JacobianPoint(this.x, mod(-this.y), this.z);
        }
        double() {
            const { x: X1, y: Y1, z: Z1 } = this;
            const A = mod(X1 * X1);
            const B = mod(Y1 * Y1);
            const C = mod(B * B);
            const x1b = X1 + B;
            const D = mod(_2n * (mod(x1b * x1b) - A - C));
            const E = mod(_3n * A);
            const F = mod(E * E);
            const X3 = mod(F - _2n * D);
            const Y3 = mod(E * (D - X3) - _8n * C);
            const Z3 = mod(_2n * Y1 * Z1);
            return new JacobianPoint(X3, Y3, Z3);
        }
        add(other) {
            if (!(other instanceof JacobianPoint))
                throw new TypeError('JacobianPoint expected');
            const { x: X1, y: Y1, z: Z1 } = this;
            const { x: X2, y: Y2, z: Z2 } = other;
            if (X2 === _0n || Y2 === _0n)
                return this;
            if (X1 === _0n || Y1 === _0n)
                return other;
            const Z1Z1 = mod(Z1 * Z1);
            const Z2Z2 = mod(Z2 * Z2);
            const U1 = mod(X1 * Z2Z2);
            const U2 = mod(X2 * Z1Z1);
            const S1 = mod(mod(Y1 * Z2) * Z2Z2);
            const S2 = mod(mod(Y2 * Z1) * Z1Z1);
            const H = mod(U2 - U1);
            const r = mod(S2 - S1);
            if (H === _0n) {
                if (r === _0n) {
                    return this.double();
                }
                else {
                    return JacobianPoint.ZERO;
                }
            }
            const HH = mod(H * H);
            const HHH = mod(H * HH);
            const V = mod(U1 * HH);
            const X3 = mod(r * r - HHH - _2n * V);
            const Y3 = mod(r * (V - X3) - S1 * HHH);
            const Z3 = mod(Z1 * Z2 * H);
            return new JacobianPoint(X3, Y3, Z3);
        }
        subtract(other) {
            return this.add(other.negate());
        }
        multiplyUnsafe(scalar) {
            const P0 = JacobianPoint.ZERO;
            if (typeof scalar === 'bigint' && scalar === _0n)
                return P0;
            let n = normalizeScalar(scalar);
            if (n === _1n)
                return this;
            if (!USE_ENDOMORPHISM) {
                let p = P0;
                let d = this;
                while (n > _0n) {
                    if (n & _1n)
                        p = p.add(d);
                    d = d.double();
                    n >>= _1n;
                }
                return p;
            }
            let { k1neg, k1, k2neg, k2 } = splitScalarEndo(n);
            let k1p = P0;
            let k2p = P0;
            let d = this;
            while (k1 > _0n || k2 > _0n) {
                if (k1 & _1n)
                    k1p = k1p.add(d);
                if (k2 & _1n)
                    k2p = k2p.add(d);
                d = d.double();
                k1 >>= _1n;
                k2 >>= _1n;
            }
            if (k1neg)
                k1p = k1p.negate();
            if (k2neg)
                k2p = k2p.negate();
            k2p = new JacobianPoint(mod(k2p.x * CURVE.beta), k2p.y, k2p.z);
            return k1p.add(k2p);
        }
        precomputeWindow(W) {
            const windows = USE_ENDOMORPHISM ? 128 / W + 1 : 256 / W + 1;
            const points = [];
            let p = this;
            let base = p;
            for (let window = 0; window < windows; window++) {
                base = p;
                points.push(base);
                for (let i = 1; i < 2 ** (W - 1); i++) {
                    base = base.add(p);
                    points.push(base);
                }
                p = base.double();
            }
            return points;
        }
        wNAF(n, affinePoint) {
            if (!affinePoint && this.equals(JacobianPoint.BASE))
                affinePoint = Point.BASE;
            const W = (affinePoint && affinePoint._WINDOW_SIZE) || 1;
            if (256 % W) {
                throw new Error('Point#wNAF: Invalid precomputation window, must be power of 2');
            }
            let precomputes = affinePoint && pointPrecomputes.get(affinePoint);
            if (!precomputes) {
                precomputes = this.precomputeWindow(W);
                if (affinePoint && W !== 1) {
                    precomputes = JacobianPoint.normalizeZ(precomputes);
                    pointPrecomputes.set(affinePoint, precomputes);
                }
            }
            let p = JacobianPoint.ZERO;
            let f = JacobianPoint.ZERO;
            const windows = 1 + (USE_ENDOMORPHISM ? 128 / W : 256 / W);
            const windowSize = 2 ** (W - 1);
            const mask = BigInt(2 ** W - 1);
            const maxNumber = 2 ** W;
            const shiftBy = BigInt(W);
            for (let window = 0; window < windows; window++) {
                const offset = window * windowSize;
                let wbits = Number(n & mask);
                n >>= shiftBy;
                if (wbits > windowSize) {
                    wbits -= maxNumber;
                    n += _1n;
                }
                if (wbits === 0) {
                    let pr = precomputes[offset];
                    if (window % 2)
                        pr = pr.negate();
                    f = f.add(pr);
                }
                else {
                    let cached = precomputes[offset + Math.abs(wbits) - 1];
                    if (wbits < 0)
                        cached = cached.negate();
                    p = p.add(cached);
                }
            }
            return { p, f };
        }
        multiply(scalar, affinePoint) {
            let n = normalizeScalar(scalar);
            let point;
            let fake;
            if (USE_ENDOMORPHISM) {
                const { k1neg, k1, k2neg, k2 } = splitScalarEndo(n);
                let { p: k1p, f: f1p } = this.wNAF(k1, affinePoint);
                let { p: k2p, f: f2p } = this.wNAF(k2, affinePoint);
                if (k1neg)
                    k1p = k1p.negate();
                if (k2neg)
                    k2p = k2p.negate();
                k2p = new JacobianPoint(mod(k2p.x * CURVE.beta), k2p.y, k2p.z);
                point = k1p.add(k2p);
                fake = f1p.add(f2p);
            }
            else {
                const { p, f } = this.wNAF(n, affinePoint);
                point = p;
                fake = f;
            }
            return JacobianPoint.normalizeZ([point, fake])[0];
        }
        toAffine(invZ = invert(this.z)) {
            const { x, y, z } = this;
            const iz1 = invZ;
            const iz2 = mod(iz1 * iz1);
            const iz3 = mod(iz2 * iz1);
            const ax = mod(x * iz2);
            const ay = mod(y * iz3);
            const zz = mod(z * iz1);
            if (zz !== _1n)
                throw new Error('invZ was invalid');
            return new Point(ax, ay);
        }
    }
    JacobianPoint.BASE = new JacobianPoint(CURVE.Gx, CURVE.Gy, _1n);
    JacobianPoint.ZERO = new JacobianPoint(_0n, _1n, _0n);
    const pointPrecomputes = new WeakMap();
    class Point {
        constructor(x, y) {
            this.x = x;
            this.y = y;
        }
        _setWindowSize(windowSize) {
            this._WINDOW_SIZE = windowSize;
            pointPrecomputes.delete(this);
        }
        hasEvenY() {
            return this.y % _2n === _0n;
        }
        static fromCompressedHex(bytes) {
            const isShort = bytes.length === 32;
            const x = bytesToNumber$1(isShort ? bytes : bytes.subarray(1));
            if (!isValidFieldElement(x))
                throw new Error('Point is not on curve');
            const y2 = weistrass(x);
            let y = sqrtMod(y2);
            const isYOdd = (y & _1n) === _1n;
            if (isShort) {
                if (isYOdd)
                    y = mod(-y);
            }
            else {
                const isFirstByteOdd = (bytes[0] & 1) === 1;
                if (isFirstByteOdd !== isYOdd)
                    y = mod(-y);
            }
            const point = new Point(x, y);
            point.assertValidity();
            return point;
        }
        static fromUncompressedHex(bytes) {
            const x = bytesToNumber$1(bytes.subarray(1, 33));
            const y = bytesToNumber$1(bytes.subarray(33, 65));
            const point = new Point(x, y);
            point.assertValidity();
            return point;
        }
        static fromHex(hex) {
            const bytes = ensureBytes(hex);
            const len = bytes.length;
            const header = bytes[0];
            if (len === 32 || (len === 33 && (header === 0x02 || header === 0x03))) {
                return this.fromCompressedHex(bytes);
            }
            if (len === 65 && header === 0x04)
                return this.fromUncompressedHex(bytes);
            throw new Error(`Point.fromHex: received invalid point. Expected 32-33 compressed bytes or 65 uncompressed bytes, not ${len}`);
        }
        static fromPrivateKey(privateKey) {
            return Point.BASE.multiply(normalizePrivateKey(privateKey));
        }
        static fromSignature(msgHash, signature, recovery) {
            msgHash = ensureBytes(msgHash);
            const h = truncateHash(msgHash);
            const { r, s } = normalizeSignature(signature);
            if (recovery !== 0 && recovery !== 1) {
                throw new Error('Cannot recover signature: invalid recovery bit');
            }
            const prefix = recovery & 1 ? '03' : '02';
            const R = Point.fromHex(prefix + numTo32bStr(r));
            const { n } = CURVE;
            const rinv = invert(r, n);
            const u1 = mod(-h * rinv, n);
            const u2 = mod(s * rinv, n);
            const Q = Point.BASE.multiplyAndAddUnsafe(R, u1, u2);
            if (!Q)
                throw new Error('Cannot recover signature: point at infinify');
            Q.assertValidity();
            return Q;
        }
        toRawBytes(isCompressed = false) {
            return hexToBytes$1(this.toHex(isCompressed));
        }
        toHex(isCompressed = false) {
            const x = numTo32bStr(this.x);
            if (isCompressed) {
                const prefix = this.hasEvenY() ? '02' : '03';
                return `${prefix}${x}`;
            }
            else {
                return `04${x}${numTo32bStr(this.y)}`;
            }
        }
        toHexX() {
            return this.toHex(true).slice(2);
        }
        toRawX() {
            return this.toRawBytes(true).slice(1);
        }
        assertValidity() {
            const msg = 'Point is not on elliptic curve';
            const { x, y } = this;
            if (!isValidFieldElement(x) || !isValidFieldElement(y))
                throw new Error(msg);
            const left = mod(y * y);
            const right = weistrass(x);
            if (mod(left - right) !== _0n)
                throw new Error(msg);
        }
        equals(other) {
            return this.x === other.x && this.y === other.y;
        }
        negate() {
            return new Point(this.x, mod(-this.y));
        }
        double() {
            return JacobianPoint.fromAffine(this).double().toAffine();
        }
        add(other) {
            return JacobianPoint.fromAffine(this).add(JacobianPoint.fromAffine(other)).toAffine();
        }
        subtract(other) {
            return this.add(other.negate());
        }
        multiply(scalar) {
            return JacobianPoint.fromAffine(this).multiply(scalar, this).toAffine();
        }
        multiplyAndAddUnsafe(Q, a, b) {
            const P = JacobianPoint.fromAffine(this);
            const aP = a === _0n || a === _1n || this !== Point.BASE ? P.multiplyUnsafe(a) : P.multiply(a);
            const bQ = JacobianPoint.fromAffine(Q).multiplyUnsafe(b);
            const sum = aP.add(bQ);
            return sum.equals(JacobianPoint.ZERO) ? undefined : sum.toAffine();
        }
    }
    Point.BASE = new Point(CURVE.Gx, CURVE.Gy);
    Point.ZERO = new Point(_0n, _0n);
    function sliceDER(s) {
        return Number.parseInt(s[0], 16) >= 8 ? '00' + s : s;
    }
    function parseDERInt(data) {
        if (data.length < 2 || data[0] !== 0x02) {
            throw new Error(`Invalid signature integer tag: ${bytesToHex$1(data)}`);
        }
        const len = data[1];
        const res = data.subarray(2, len + 2);
        if (!len || res.length !== len) {
            throw new Error(`Invalid signature integer: wrong length`);
        }
        if (res[0] === 0x00 && res[1] <= 0x7f) {
            throw new Error('Invalid signature integer: trailing length');
        }
        return { data: bytesToNumber$1(res), left: data.subarray(len + 2) };
    }
    function parseDERSignature(data) {
        if (data.length < 2 || data[0] != 0x30) {
            throw new Error(`Invalid signature tag: ${bytesToHex$1(data)}`);
        }
        if (data[1] !== data.length - 2) {
            throw new Error('Invalid signature: incorrect length');
        }
        const { data: r, left: sBytes } = parseDERInt(data.subarray(2));
        const { data: s, left: rBytesLeft } = parseDERInt(sBytes);
        if (rBytesLeft.length) {
            throw new Error(`Invalid signature: left bytes after parsing: ${bytesToHex$1(rBytesLeft)}`);
        }
        return { r, s };
    }
    class Signature {
        constructor(r, s) {
            this.r = r;
            this.s = s;
            this.assertValidity();
        }
        static fromCompact(hex) {
            const arr = hex instanceof Uint8Array;
            const name = 'Signature.fromCompact';
            if (typeof hex !== 'string' && !arr)
                throw new TypeError(`${name}: Expected string or Uint8Array`);
            const str = arr ? bytesToHex$1(hex) : hex;
            if (str.length !== 128)
                throw new Error(`${name}: Expected 64-byte hex`);
            return new Signature(hexToNumber(str.slice(0, 64)), hexToNumber(str.slice(64, 128)));
        }
        static fromDER(hex) {
            const arr = hex instanceof Uint8Array;
            if (typeof hex !== 'string' && !arr)
                throw new TypeError(`Signature.fromDER: Expected string or Uint8Array`);
            const { r, s } = parseDERSignature(arr ? hex : hexToBytes$1(hex));
            return new Signature(r, s);
        }
        static fromHex(hex) {
            return this.fromDER(hex);
        }
        assertValidity() {
            const { r, s } = this;
            if (!isWithinCurveOrder(r))
                throw new Error('Invalid Signature: r must be 0 < r < n');
            if (!isWithinCurveOrder(s))
                throw new Error('Invalid Signature: s must be 0 < s < n');
        }
        hasHighS() {
            const HALF = CURVE.n >> _1n;
            return this.s > HALF;
        }
        normalizeS() {
            return this.hasHighS() ? new Signature(this.r, CURVE.n - this.s) : this;
        }
        toDERRawBytes(isCompressed = false) {
            return hexToBytes$1(this.toDERHex(isCompressed));
        }
        toDERHex(isCompressed = false) {
            const sHex = sliceDER(numberToHexUnpadded(this.s));
            if (isCompressed)
                return sHex;
            const rHex = sliceDER(numberToHexUnpadded(this.r));
            const rLen = numberToHexUnpadded(rHex.length / 2);
            const sLen = numberToHexUnpadded(sHex.length / 2);
            const length = numberToHexUnpadded(rHex.length / 2 + sHex.length / 2 + 4);
            return `30${length}02${rLen}${rHex}02${sLen}${sHex}`;
        }
        toRawBytes() {
            return this.toDERRawBytes();
        }
        toHex() {
            return this.toDERHex();
        }
        toCompactRawBytes() {
            return hexToBytes$1(this.toCompactHex());
        }
        toCompactHex() {
            return numTo32bStr(this.r) + numTo32bStr(this.s);
        }
    }
    function concatBytes$1(...arrays) {
        if (!arrays.every((b) => b instanceof Uint8Array))
            throw new Error('Uint8Array list expected');
        if (arrays.length === 1)
            return arrays[0];
        const length = arrays.reduce((a, arr) => a + arr.length, 0);
        const result = new Uint8Array(length);
        for (let i = 0, pad = 0; i < arrays.length; i++) {
            const arr = arrays[i];
            result.set(arr, pad);
            pad += arr.length;
        }
        return result;
    }
    const hexes$1 = Array.from({ length: 256 }, (v, i) => i.toString(16).padStart(2, '0'));
    function bytesToHex$1(uint8a) {
        if (!(uint8a instanceof Uint8Array))
            throw new Error('Expected Uint8Array');
        let hex = '';
        for (let i = 0; i < uint8a.length; i++) {
            hex += hexes$1[uint8a[i]];
        }
        return hex;
    }
    const POW_2_256 = BigInt('0x10000000000000000000000000000000000000000000000000000000000000000');
    function numTo32bStr(num) {
        if (typeof num !== 'bigint')
            throw new Error('Expected bigint');
        if (!(_0n <= num && num < POW_2_256))
            throw new Error('Expected number < 2^256');
        return num.toString(16).padStart(64, '0');
    }
    function numTo32b(num) {
        const b = hexToBytes$1(numTo32bStr(num));
        if (b.length !== 32)
            throw new Error('Error: expected 32 bytes');
        return b;
    }
    function numberToHexUnpadded(num) {
        const hex = num.toString(16);
        return hex.length & 1 ? `0${hex}` : hex;
    }
    function hexToNumber(hex) {
        if (typeof hex !== 'string') {
            throw new TypeError('hexToNumber: expected string, got ' + typeof hex);
        }
        return BigInt(`0x${hex}`);
    }
    function hexToBytes$1(hex) {
        if (typeof hex !== 'string') {
            throw new TypeError('hexToBytes: expected string, got ' + typeof hex);
        }
        if (hex.length % 2)
            throw new Error('hexToBytes: received invalid unpadded hex' + hex.length);
        const array = new Uint8Array(hex.length / 2);
        for (let i = 0; i < array.length; i++) {
            const j = i * 2;
            const hexByte = hex.slice(j, j + 2);
            const byte = Number.parseInt(hexByte, 16);
            if (Number.isNaN(byte) || byte < 0)
                throw new Error('Invalid byte sequence');
            array[i] = byte;
        }
        return array;
    }
    function bytesToNumber$1(bytes) {
        return hexToNumber(bytesToHex$1(bytes));
    }
    function ensureBytes(hex) {
        return hex instanceof Uint8Array ? Uint8Array.from(hex) : hexToBytes$1(hex);
    }
    function normalizeScalar(num) {
        if (typeof num === 'number' && Number.isSafeInteger(num) && num > 0)
            return BigInt(num);
        if (typeof num === 'bigint' && isWithinCurveOrder(num))
            return num;
        throw new TypeError('Expected valid private scalar: 0 < scalar < curve.n');
    }
    function mod(a, b = CURVE.P) {
        const result = a % b;
        return result >= _0n ? result : b + result;
    }
    function pow2(x, power) {
        const { P } = CURVE;
        let res = x;
        while (power-- > _0n) {
            res *= res;
            res %= P;
        }
        return res;
    }
    function sqrtMod(x) {
        const { P } = CURVE;
        const _6n = BigInt(6);
        const _11n = BigInt(11);
        const _22n = BigInt(22);
        const _23n = BigInt(23);
        const _44n = BigInt(44);
        const _88n = BigInt(88);
        const b2 = (x * x * x) % P;
        const b3 = (b2 * b2 * x) % P;
        const b6 = (pow2(b3, _3n) * b3) % P;
        const b9 = (pow2(b6, _3n) * b3) % P;
        const b11 = (pow2(b9, _2n) * b2) % P;
        const b22 = (pow2(b11, _11n) * b11) % P;
        const b44 = (pow2(b22, _22n) * b22) % P;
        const b88 = (pow2(b44, _44n) * b44) % P;
        const b176 = (pow2(b88, _88n) * b88) % P;
        const b220 = (pow2(b176, _44n) * b44) % P;
        const b223 = (pow2(b220, _3n) * b3) % P;
        const t1 = (pow2(b223, _23n) * b22) % P;
        const t2 = (pow2(t1, _6n) * b2) % P;
        return pow2(t2, _2n);
    }
    function invert(number, modulo = CURVE.P) {
        if (number === _0n || modulo <= _0n) {
            throw new Error(`invert: expected positive integers, got n=${number} mod=${modulo}`);
        }
        let a = mod(number, modulo);
        let b = modulo;
        let x = _0n, u = _1n;
        while (a !== _0n) {
            const q = b / a;
            const r = b % a;
            const m = x - u * q;
            b = a, a = r, x = u, u = m;
        }
        const gcd = b;
        if (gcd !== _1n)
            throw new Error('invert: does not exist');
        return mod(x, modulo);
    }
    function invertBatch(nums, p = CURVE.P) {
        const scratch = new Array(nums.length);
        const lastMultiplied = nums.reduce((acc, num, i) => {
            if (num === _0n)
                return acc;
            scratch[i] = acc;
            return mod(acc * num, p);
        }, _1n);
        const inverted = invert(lastMultiplied, p);
        nums.reduceRight((acc, num, i) => {
            if (num === _0n)
                return acc;
            scratch[i] = mod(acc * scratch[i], p);
            return mod(acc * num, p);
        }, inverted);
        return scratch;
    }
    const divNearest = (a, b) => (a + b / _2n) / b;
    const ENDO = {
        a1: BigInt('0x3086d221a7d46bcde86c90e49284eb15'),
        b1: -_1n * BigInt('0xe4437ed6010e88286f547fa90abfe4c3'),
        a2: BigInt('0x114ca50f7a8e2f3f657c1108d9d44cfd8'),
        b2: BigInt('0x3086d221a7d46bcde86c90e49284eb15'),
        POW_2_128: BigInt('0x100000000000000000000000000000000'),
    };
    function splitScalarEndo(k) {
        const { n } = CURVE;
        const { a1, b1, a2, b2, POW_2_128 } = ENDO;
        const c1 = divNearest(b2 * k, n);
        const c2 = divNearest(-b1 * k, n);
        let k1 = mod(k - c1 * a1 - c2 * a2, n);
        let k2 = mod(-c1 * b1 - c2 * b2, n);
        const k1neg = k1 > POW_2_128;
        const k2neg = k2 > POW_2_128;
        if (k1neg)
            k1 = n - k1;
        if (k2neg)
            k2 = n - k2;
        if (k1 > POW_2_128 || k2 > POW_2_128) {
            throw new Error('splitScalarEndo: Endomorphism failed, k=' + k);
        }
        return { k1neg, k1, k2neg, k2 };
    }
    function truncateHash(hash) {
        const { n } = CURVE;
        const byteLength = hash.length;
        const delta = byteLength * 8 - 256;
        let h = bytesToNumber$1(hash);
        if (delta > 0)
            h = h >> BigInt(delta);
        if (h >= n)
            h -= n;
        return h;
    }
    let _sha256Sync;
    let _hmacSha256Sync;
    class HmacDrbg {
        constructor() {
            this.v = new Uint8Array(32).fill(1);
            this.k = new Uint8Array(32).fill(0);
            this.counter = 0;
        }
        hmac(...values) {
            return utils$1.hmacSha256(this.k, ...values);
        }
        hmacSync(...values) {
            return _hmacSha256Sync(this.k, ...values);
        }
        checkSync() {
            if (typeof _hmacSha256Sync !== 'function')
                throw new ShaError('hmacSha256Sync needs to be set');
        }
        incr() {
            if (this.counter >= 1000)
                throw new Error('Tried 1,000 k values for sign(), all were invalid');
            this.counter += 1;
        }
        async reseed(seed = new Uint8Array()) {
            this.k = await this.hmac(this.v, Uint8Array.from([0x00]), seed);
            this.v = await this.hmac(this.v);
            if (seed.length === 0)
                return;
            this.k = await this.hmac(this.v, Uint8Array.from([0x01]), seed);
            this.v = await this.hmac(this.v);
        }
        reseedSync(seed = new Uint8Array()) {
            this.checkSync();
            this.k = this.hmacSync(this.v, Uint8Array.from([0x00]), seed);
            this.v = this.hmacSync(this.v);
            if (seed.length === 0)
                return;
            this.k = this.hmacSync(this.v, Uint8Array.from([0x01]), seed);
            this.v = this.hmacSync(this.v);
        }
        async generate() {
            this.incr();
            this.v = await this.hmac(this.v);
            return this.v;
        }
        generateSync() {
            this.checkSync();
            this.incr();
            this.v = this.hmacSync(this.v);
            return this.v;
        }
    }
    function isWithinCurveOrder(num) {
        return _0n < num && num < CURVE.n;
    }
    function isValidFieldElement(num) {
        return _0n < num && num < CURVE.P;
    }
    function kmdToSig(kBytes, m, d) {
        const k = bytesToNumber$1(kBytes);
        if (!isWithinCurveOrder(k))
            return;
        const { n } = CURVE;
        const q = Point.BASE.multiply(k);
        const r = mod(q.x, n);
        if (r === _0n)
            return;
        const s = mod(invert(k, n) * mod(m + d * r, n), n);
        if (s === _0n)
            return;
        const sig = new Signature(r, s);
        const recovery = (q.x === sig.r ? 0 : 2) | Number(q.y & _1n);
        return { sig, recovery };
    }
    function normalizePrivateKey(key) {
        let num;
        if (typeof key === 'bigint') {
            num = key;
        }
        else if (typeof key === 'number' && Number.isSafeInteger(key) && key > 0) {
            num = BigInt(key);
        }
        else if (typeof key === 'string') {
            if (key.length !== 64)
                throw new Error('Expected 32 bytes of private key');
            num = hexToNumber(key);
        }
        else if (key instanceof Uint8Array) {
            if (key.length !== 32)
                throw new Error('Expected 32 bytes of private key');
            num = bytesToNumber$1(key);
        }
        else {
            throw new TypeError('Expected valid private key');
        }
        if (!isWithinCurveOrder(num))
            throw new Error('Expected private key: 0 < key < n');
        return num;
    }
    function normalizePublicKey(publicKey) {
        if (publicKey instanceof Point) {
            publicKey.assertValidity();
            return publicKey;
        }
        else {
            return Point.fromHex(publicKey);
        }
    }
    function normalizeSignature(signature) {
        if (signature instanceof Signature) {
            signature.assertValidity();
            return signature;
        }
        try {
            return Signature.fromDER(signature);
        }
        catch (error) {
            return Signature.fromCompact(signature);
        }
    }
    function getPublicKey$1(privateKey, isCompressed = false) {
        return Point.fromPrivateKey(privateKey).toRawBytes(isCompressed);
    }
    function isProbPub(item) {
        const arr = item instanceof Uint8Array;
        const str = typeof item === 'string';
        const len = (arr || str) && item.length;
        if (arr)
            return len === 33 || len === 65;
        if (str)
            return len === 66 || len === 130;
        if (item instanceof Point)
            return true;
        return false;
    }
    function getSharedSecret(privateA, publicB, isCompressed = false) {
        if (isProbPub(privateA))
            throw new TypeError('getSharedSecret: first arg must be private key');
        if (!isProbPub(publicB))
            throw new TypeError('getSharedSecret: second arg must be public key');
        const b = normalizePublicKey(publicB);
        b.assertValidity();
        return b.multiply(normalizePrivateKey(privateA)).toRawBytes(isCompressed);
    }
    function bits2int(bytes) {
        const slice = bytes.length > 32 ? bytes.slice(0, 32) : bytes;
        return bytesToNumber$1(slice);
    }
    function bits2octets(bytes) {
        const z1 = bits2int(bytes);
        const z2 = mod(z1, CURVE.n);
        return int2octets(z2 < _0n ? z1 : z2);
    }
    function int2octets(num) {
        return numTo32b(num);
    }
    function initSigArgs(msgHash, privateKey, extraEntropy) {
        if (msgHash == null)
            throw new Error(`sign: expected valid message hash, not "${msgHash}"`);
        const h1 = ensureBytes(msgHash);
        const d = normalizePrivateKey(privateKey);
        const seedArgs = [int2octets(d), bits2octets(h1)];
        if (extraEntropy != null) {
            if (extraEntropy === true)
                extraEntropy = utils$1.randomBytes(32);
            const e = ensureBytes(extraEntropy);
            if (e.length !== 32)
                throw new Error('sign: Expected 32 bytes of extra data');
            seedArgs.push(e);
        }
        const seed = concatBytes$1(...seedArgs);
        const m = bits2int(h1);
        return { seed, m, d };
    }
    function finalizeSig(recSig, opts) {
        let { sig, recovery } = recSig;
        const { canonical, der, recovered } = Object.assign({ canonical: true, der: true }, opts);
        if (canonical && sig.hasHighS()) {
            sig = sig.normalizeS();
            recovery ^= 1;
        }
        const hashed = der ? sig.toDERRawBytes() : sig.toCompactRawBytes();
        return recovered ? [hashed, recovery] : hashed;
    }
    function signSync(msgHash, privKey, opts = {}) {
        const { seed, m, d } = initSigArgs(msgHash, privKey, opts.extraEntropy);
        let sig;
        const drbg = new HmacDrbg();
        drbg.reseedSync(seed);
        while (!(sig = kmdToSig(drbg.generateSync(), m, d)))
            drbg.reseedSync();
        return finalizeSig(sig, opts);
    }
    const vopts = { strict: true };
    function verify(signature, msgHash, publicKey, opts = vopts) {
        let sig;
        try {
            sig = normalizeSignature(signature);
            msgHash = ensureBytes(msgHash);
        }
        catch (error) {
            return false;
        }
        const { r, s } = sig;
        if (opts.strict && sig.hasHighS())
            return false;
        const h = truncateHash(msgHash);
        let P;
        try {
            P = normalizePublicKey(publicKey);
        }
        catch (error) {
            return false;
        }
        const { n } = CURVE;
        const sinv = invert(s, n);
        const u1 = mod(h * sinv, n);
        const u2 = mod(r * sinv, n);
        const R = Point.BASE.multiplyAndAddUnsafe(P, u1, u2);
        if (!R)
            return false;
        const v = mod(R.x, n);
        return v === r;
    }
    function schnorrChallengeFinalize(ch) {
        return mod(bytesToNumber$1(ch), CURVE.n);
    }
    class SchnorrSignature {
        constructor(r, s) {
            this.r = r;
            this.s = s;
            this.assertValidity();
        }
        static fromHex(hex) {
            const bytes = ensureBytes(hex);
            if (bytes.length !== 64)
                throw new TypeError(`SchnorrSignature.fromHex: expected 64 bytes, not ${bytes.length}`);
            const r = bytesToNumber$1(bytes.subarray(0, 32));
            const s = bytesToNumber$1(bytes.subarray(32, 64));
            return new SchnorrSignature(r, s);
        }
        assertValidity() {
            const { r, s } = this;
            if (!isValidFieldElement(r) || !isWithinCurveOrder(s))
                throw new Error('Invalid signature');
        }
        toHex() {
            return numTo32bStr(this.r) + numTo32bStr(this.s);
        }
        toRawBytes() {
            return hexToBytes$1(this.toHex());
        }
    }
    function schnorrGetPublicKey(privateKey) {
        return Point.fromPrivateKey(privateKey).toRawX();
    }
    class InternalSchnorrSignature {
        constructor(message, privateKey, auxRand = utils$1.randomBytes()) {
            if (message == null)
                throw new TypeError(`sign: Expected valid message, not "${message}"`);
            this.m = ensureBytes(message);
            const { x, scalar } = this.getScalar(normalizePrivateKey(privateKey));
            this.px = x;
            this.d = scalar;
            this.rand = ensureBytes(auxRand);
            if (this.rand.length !== 32)
                throw new TypeError('sign: Expected 32 bytes of aux randomness');
        }
        getScalar(priv) {
            const point = Point.fromPrivateKey(priv);
            const scalar = point.hasEvenY() ? priv : CURVE.n - priv;
            return { point, scalar, x: point.toRawX() };
        }
        initNonce(d, t0h) {
            return numTo32b(d ^ bytesToNumber$1(t0h));
        }
        finalizeNonce(k0h) {
            const k0 = mod(bytesToNumber$1(k0h), CURVE.n);
            if (k0 === _0n)
                throw new Error('sign: Creation of signature failed. k is zero');
            const { point: R, x: rx, scalar: k } = this.getScalar(k0);
            return { R, rx, k };
        }
        finalizeSig(R, k, e, d) {
            return new SchnorrSignature(R.x, mod(k + e * d, CURVE.n)).toRawBytes();
        }
        error() {
            throw new Error('sign: Invalid signature produced');
        }
        async calc() {
            const { m, d, px, rand } = this;
            const tag = utils$1.taggedHash;
            const t = this.initNonce(d, await tag(TAGS.aux, rand));
            const { R, rx, k } = this.finalizeNonce(await tag(TAGS.nonce, t, px, m));
            const e = schnorrChallengeFinalize(await tag(TAGS.challenge, rx, px, m));
            const sig = this.finalizeSig(R, k, e, d);
            if (!(await schnorrVerify(sig, m, px)))
                this.error();
            return sig;
        }
        calcSync() {
            const { m, d, px, rand } = this;
            const tag = utils$1.taggedHashSync;
            const t = this.initNonce(d, tag(TAGS.aux, rand));
            const { R, rx, k } = this.finalizeNonce(tag(TAGS.nonce, t, px, m));
            const e = schnorrChallengeFinalize(tag(TAGS.challenge, rx, px, m));
            const sig = this.finalizeSig(R, k, e, d);
            if (!schnorrVerifySync(sig, m, px))
                this.error();
            return sig;
        }
    }
    async function schnorrSign(msg, privKey, auxRand) {
        return new InternalSchnorrSignature(msg, privKey, auxRand).calc();
    }
    function schnorrSignSync(msg, privKey, auxRand) {
        return new InternalSchnorrSignature(msg, privKey, auxRand).calcSync();
    }
    function initSchnorrVerify(signature, message, publicKey) {
        const raw = signature instanceof SchnorrSignature;
        const sig = raw ? signature : SchnorrSignature.fromHex(signature);
        if (raw)
            sig.assertValidity();
        return {
            ...sig,
            m: ensureBytes(message),
            P: normalizePublicKey(publicKey),
        };
    }
    function finalizeSchnorrVerify(r, P, s, e) {
        const R = Point.BASE.multiplyAndAddUnsafe(P, normalizePrivateKey(s), mod(-e, CURVE.n));
        if (!R || !R.hasEvenY() || R.x !== r)
            return false;
        return true;
    }
    async function schnorrVerify(signature, message, publicKey) {
        try {
            const { r, s, m, P } = initSchnorrVerify(signature, message, publicKey);
            const e = schnorrChallengeFinalize(await utils$1.taggedHash(TAGS.challenge, numTo32b(r), P.toRawX(), m));
            return finalizeSchnorrVerify(r, P, s, e);
        }
        catch (error) {
            return false;
        }
    }
    function schnorrVerifySync(signature, message, publicKey) {
        try {
            const { r, s, m, P } = initSchnorrVerify(signature, message, publicKey);
            const e = schnorrChallengeFinalize(utils$1.taggedHashSync(TAGS.challenge, numTo32b(r), P.toRawX(), m));
            return finalizeSchnorrVerify(r, P, s, e);
        }
        catch (error) {
            if (error instanceof ShaError)
                throw error;
            return false;
        }
    }
    const schnorr = {
        Signature: SchnorrSignature,
        getPublicKey: schnorrGetPublicKey,
        sign: schnorrSign,
        verify: schnorrVerify,
        signSync: schnorrSignSync,
        verifySync: schnorrVerifySync,
    };
    Point.BASE._setWindowSize(8);
    const crypto$2 = {
        node: nodeCrypto,
        web: typeof self === 'object' && 'crypto' in self ? self.crypto : undefined,
    };
    const TAGS = {
        challenge: 'BIP0340/challenge',
        aux: 'BIP0340/aux',
        nonce: 'BIP0340/nonce',
    };
    const TAGGED_HASH_PREFIXES = {};
    const utils$1 = {
        bytesToHex: bytesToHex$1,
        hexToBytes: hexToBytes$1,
        concatBytes: concatBytes$1,
        mod,
        invert,
        isValidPrivateKey(privateKey) {
            try {
                normalizePrivateKey(privateKey);
                return true;
            }
            catch (error) {
                return false;
            }
        },
        _bigintTo32Bytes: numTo32b,
        _normalizePrivateKey: normalizePrivateKey,
        hashToPrivateKey: (hash) => {
            hash = ensureBytes(hash);
            if (hash.length < 40 || hash.length > 1024)
                throw new Error('Expected 40-1024 bytes of private key as per FIPS 186');
            const num = mod(bytesToNumber$1(hash), CURVE.n - _1n) + _1n;
            return numTo32b(num);
        },
        randomBytes: (bytesLength = 32) => {
            if (crypto$2.web) {
                return crypto$2.web.getRandomValues(new Uint8Array(bytesLength));
            }
            else if (crypto$2.node) {
                const { randomBytes } = crypto$2.node;
                return Uint8Array.from(randomBytes(bytesLength));
            }
            else {
                throw new Error("The environment doesn't have randomBytes function");
            }
        },
        randomPrivateKey: () => {
            return utils$1.hashToPrivateKey(utils$1.randomBytes(40));
        },
        sha256: async (...messages) => {
            if (crypto$2.web) {
                const buffer = await crypto$2.web.subtle.digest('SHA-256', concatBytes$1(...messages));
                return new Uint8Array(buffer);
            }
            else if (crypto$2.node) {
                const { createHash } = crypto$2.node;
                const hash = createHash('sha256');
                messages.forEach((m) => hash.update(m));
                return Uint8Array.from(hash.digest());
            }
            else {
                throw new Error("The environment doesn't have sha256 function");
            }
        },
        hmacSha256: async (key, ...messages) => {
            if (crypto$2.web) {
                const ckey = await crypto$2.web.subtle.importKey('raw', key, { name: 'HMAC', hash: { name: 'SHA-256' } }, false, ['sign']);
                const message = concatBytes$1(...messages);
                const buffer = await crypto$2.web.subtle.sign('HMAC', ckey, message);
                return new Uint8Array(buffer);
            }
            else if (crypto$2.node) {
                const { createHmac } = crypto$2.node;
                const hash = createHmac('sha256', key);
                messages.forEach((m) => hash.update(m));
                return Uint8Array.from(hash.digest());
            }
            else {
                throw new Error("The environment doesn't have hmac-sha256 function");
            }
        },
        sha256Sync: undefined,
        hmacSha256Sync: undefined,
        taggedHash: async (tag, ...messages) => {
            let tagP = TAGGED_HASH_PREFIXES[tag];
            if (tagP === undefined) {
                const tagH = await utils$1.sha256(Uint8Array.from(tag, (c) => c.charCodeAt(0)));
                tagP = concatBytes$1(tagH, tagH);
                TAGGED_HASH_PREFIXES[tag] = tagP;
            }
            return utils$1.sha256(tagP, ...messages);
        },
        taggedHashSync: (tag, ...messages) => {
            if (typeof _sha256Sync !== 'function')
                throw new ShaError('sha256Sync is undefined, you need to set it');
            let tagP = TAGGED_HASH_PREFIXES[tag];
            if (tagP === undefined) {
                const tagH = _sha256Sync(Uint8Array.from(tag, (c) => c.charCodeAt(0)));
                tagP = concatBytes$1(tagH, tagH);
                TAGGED_HASH_PREFIXES[tag] = tagP;
            }
            return _sha256Sync(tagP, ...messages);
        },
        precompute(windowSize = 8, point = Point.BASE) {
            const cached = point === Point.BASE ? point : new Point(point.x, point.y);
            cached._setWindowSize(windowSize);
            cached.multiply(_3n);
            return cached;
        },
    };
    Object.defineProperties(utils$1, {
        sha256Sync: {
            configurable: false,
            get() {
                return _sha256Sync;
            },
            set(val) {
                if (!_sha256Sync)
                    _sha256Sync = val;
            },
        },
        hmacSha256Sync: {
            configurable: false,
            get() {
                return _hmacSha256Sync;
            },
            set(val) {
                if (!_hmacSha256Sync)
                    _hmacSha256Sync = val;
            },
        },
    });

    function number$1(n) {
        if (!Number.isSafeInteger(n) || n < 0)
            throw new Error(`Wrong positive integer: ${n}`);
    }
    function bool$1(b) {
        if (typeof b !== 'boolean')
            throw new Error(`Expected boolean, not ${b}`);
    }
    function bytes$1(b, ...lengths) {
        if (!(b instanceof Uint8Array))
            throw new TypeError('Expected Uint8Array');
        if (lengths.length > 0 && !lengths.includes(b.length))
            throw new TypeError(`Expected Uint8Array of length ${lengths}, not of length=${b.length}`);
    }
    function hash$2(hash) {
        if (typeof hash !== 'function' || typeof hash.create !== 'function')
            throw new Error('Hash should be wrapped by utils.wrapConstructor');
        number$1(hash.outputLen);
        number$1(hash.blockLen);
    }
    function exists$1(instance, checkFinished = true) {
        if (instance.destroyed)
            throw new Error('Hash instance has been destroyed');
        if (checkFinished && instance.finished)
            throw new Error('Hash#digest() has already been called');
    }
    function output$1(out, instance) {
        bytes$1(out);
        const min = instance.outputLen;
        if (out.length < min) {
            throw new Error(`digestInto() expects output buffer of length at least ${min}`);
        }
    }
    const assert$2 = {
        number: number$1,
        bool: bool$1,
        bytes: bytes$1,
        hash: hash$2,
        exists: exists$1,
        output: output$1,
    };

    const crypto$1 = {
        node: undefined,
        web: typeof self === 'object' && 'crypto' in self ? self.crypto : undefined,
    };

    /*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // Cast array to view
    const createView = (arr) => new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
    // The rotate right (circular right shift) operation for uint32
    const rotr = (word, shift) => (word << (32 - shift)) | (word >>> shift);
    const isLE = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
    // There is almost no big endian hardware, but js typed arrays uses platform specific endianness.
    // So, just to be sure not to corrupt anything.
    if (!isLE)
        throw new Error('Non little-endian hardware is not supported');
    const hexes = Array.from({ length: 256 }, (v, i) => i.toString(16).padStart(2, '0'));
    /**
     * @example bytesToHex(Uint8Array.from([0xde, 0xad, 0xbe, 0xef]))
     */
    function bytesToHex(uint8a) {
        // pre-caching improves the speed 6x
        if (!(uint8a instanceof Uint8Array))
            throw new Error('Uint8Array expected');
        let hex = '';
        for (let i = 0; i < uint8a.length; i++) {
            hex += hexes[uint8a[i]];
        }
        return hex;
    }
    /**
     * @example hexToBytes('deadbeef')
     */
    function hexToBytes(hex) {
        if (typeof hex !== 'string') {
            throw new TypeError('hexToBytes: expected string, got ' + typeof hex);
        }
        if (hex.length % 2)
            throw new Error('hexToBytes: received invalid unpadded hex');
        const array = new Uint8Array(hex.length / 2);
        for (let i = 0; i < array.length; i++) {
            const j = i * 2;
            const hexByte = hex.slice(j, j + 2);
            const byte = Number.parseInt(hexByte, 16);
            if (Number.isNaN(byte) || byte < 0)
                throw new Error('Invalid byte sequence');
            array[i] = byte;
        }
        return array;
    }
    function utf8ToBytes(str) {
        if (typeof str !== 'string') {
            throw new TypeError(`utf8ToBytes expected string, got ${typeof str}`);
        }
        return new TextEncoder().encode(str);
    }
    function toBytes(data) {
        if (typeof data === 'string')
            data = utf8ToBytes(data);
        if (!(data instanceof Uint8Array))
            throw new TypeError(`Expected input type is Uint8Array (got ${typeof data})`);
        return data;
    }
    /**
     * Concats Uint8Array-s into one; like `Buffer.concat([buf1, buf2])`
     * @example concatBytes(buf1, buf2)
     */
    function concatBytes(...arrays) {
        if (!arrays.every((a) => a instanceof Uint8Array))
            throw new Error('Uint8Array list expected');
        if (arrays.length === 1)
            return arrays[0];
        const length = arrays.reduce((a, arr) => a + arr.length, 0);
        const result = new Uint8Array(length);
        for (let i = 0, pad = 0; i < arrays.length; i++) {
            const arr = arrays[i];
            result.set(arr, pad);
            pad += arr.length;
        }
        return result;
    }
    // For runtime check if class implements interface
    class Hash {
        // Safe version that clones internal state
        clone() {
            return this._cloneInto();
        }
    }
    function wrapConstructor(hashConstructor) {
        const hashC = (message) => hashConstructor().update(toBytes(message)).digest();
        const tmp = hashConstructor();
        hashC.outputLen = tmp.outputLen;
        hashC.blockLen = tmp.blockLen;
        hashC.create = () => hashConstructor();
        return hashC;
    }
    /**
     * Secure PRNG
     */
    function randomBytes(bytesLength = 32) {
        if (crypto$1.web) {
            return crypto$1.web.getRandomValues(new Uint8Array(bytesLength));
        }
        else {
            throw new Error("The environment doesn't have randomBytes function");
        }
    }

    // Polyfill for Safari 14
    function setBigUint64$1(view, byteOffset, value, isLE) {
        if (typeof view.setBigUint64 === 'function')
            return view.setBigUint64(byteOffset, value, isLE);
        const _32n = BigInt(32);
        const _u32_max = BigInt(0xffffffff);
        const wh = Number((value >> _32n) & _u32_max);
        const wl = Number(value & _u32_max);
        const h = isLE ? 4 : 0;
        const l = isLE ? 0 : 4;
        view.setUint32(byteOffset + h, wh, isLE);
        view.setUint32(byteOffset + l, wl, isLE);
    }
    // Base SHA2 class (RFC 6234)
    let SHA2$1 = class SHA2 extends Hash {
        constructor(blockLen, outputLen, padOffset, isLE) {
            super();
            this.blockLen = blockLen;
            this.outputLen = outputLen;
            this.padOffset = padOffset;
            this.isLE = isLE;
            this.finished = false;
            this.length = 0;
            this.pos = 0;
            this.destroyed = false;
            this.buffer = new Uint8Array(blockLen);
            this.view = createView(this.buffer);
        }
        update(data) {
            assert$2.exists(this);
            const { view, buffer, blockLen } = this;
            data = toBytes(data);
            const len = data.length;
            for (let pos = 0; pos < len;) {
                const take = Math.min(blockLen - this.pos, len - pos);
                // Fast path: we have at least one block in input, cast it to view and process
                if (take === blockLen) {
                    const dataView = createView(data);
                    for (; blockLen <= len - pos; pos += blockLen)
                        this.process(dataView, pos);
                    continue;
                }
                buffer.set(data.subarray(pos, pos + take), this.pos);
                this.pos += take;
                pos += take;
                if (this.pos === blockLen) {
                    this.process(view, 0);
                    this.pos = 0;
                }
            }
            this.length += data.length;
            this.roundClean();
            return this;
        }
        digestInto(out) {
            assert$2.exists(this);
            assert$2.output(out, this);
            this.finished = true;
            // Padding
            // We can avoid allocation of buffer for padding completely if it
            // was previously not allocated here. But it won't change performance.
            const { buffer, view, blockLen, isLE } = this;
            let { pos } = this;
            // append the bit '1' to the message
            buffer[pos++] = 0b10000000;
            this.buffer.subarray(pos).fill(0);
            // we have less than padOffset left in buffer, so we cannot put length in current block, need process it and pad again
            if (this.padOffset > blockLen - pos) {
                this.process(view, 0);
                pos = 0;
            }
            // Pad until full block byte with zeros
            for (let i = pos; i < blockLen; i++)
                buffer[i] = 0;
            // Note: sha512 requires length to be 128bit integer, but length in JS will overflow before that
            // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
            // So we just write lowest 64 bits of that value.
            setBigUint64$1(view, blockLen - 8, BigInt(this.length * 8), isLE);
            this.process(view, 0);
            const oview = createView(out);
            const len = this.outputLen;
            // NOTE: we do division by 4 later, which should be fused in single op with modulo by JIT
            if (len % 4)
                throw new Error('_sha2: outputLen should be aligned to 32bit');
            const outLen = len / 4;
            const state = this.get();
            if (outLen > state.length)
                throw new Error('_sha2: outputLen bigger than state');
            for (let i = 0; i < outLen; i++)
                oview.setUint32(4 * i, state[i], isLE);
        }
        digest() {
            const { buffer, outputLen } = this;
            this.digestInto(buffer);
            const res = buffer.slice(0, outputLen);
            this.destroy();
            return res;
        }
        _cloneInto(to) {
            to || (to = new this.constructor());
            to.set(...this.get());
            const { blockLen, buffer, length, finished, destroyed, pos } = this;
            to.length = length;
            to.pos = pos;
            to.finished = finished;
            to.destroyed = destroyed;
            if (length % blockLen)
                to.buffer.set(buffer);
            return to;
        }
    };

    // Choice: a ? b : c
    const Chi$1 = (a, b, c) => (a & b) ^ (~a & c);
    // Majority function, true if any two inpust is true
    const Maj$1 = (a, b, c) => (a & b) ^ (a & c) ^ (b & c);
    // Round constants:
    // first 32 bits of the fractional parts of the cube roots of the first 64 primes 2..311)
    // prettier-ignore
    const SHA256_K$1 = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    // Initial state (first 32 bits of the fractional parts of the square roots of the first 8 primes 2..19):
    // prettier-ignore
    const IV$1 = new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    // Temporary buffer, not used to store anything between runs
    // Named this way because it matches specification.
    const SHA256_W$1 = new Uint32Array(64);
    let SHA256$1 = class SHA256 extends SHA2$1 {
        constructor() {
            super(64, 32, 8, false);
            // We cannot use array here since array allows indexing by variable
            // which means optimizer/compiler cannot use registers.
            this.A = IV$1[0] | 0;
            this.B = IV$1[1] | 0;
            this.C = IV$1[2] | 0;
            this.D = IV$1[3] | 0;
            this.E = IV$1[4] | 0;
            this.F = IV$1[5] | 0;
            this.G = IV$1[6] | 0;
            this.H = IV$1[7] | 0;
        }
        get() {
            const { A, B, C, D, E, F, G, H } = this;
            return [A, B, C, D, E, F, G, H];
        }
        // prettier-ignore
        set(A, B, C, D, E, F, G, H) {
            this.A = A | 0;
            this.B = B | 0;
            this.C = C | 0;
            this.D = D | 0;
            this.E = E | 0;
            this.F = F | 0;
            this.G = G | 0;
            this.H = H | 0;
        }
        process(view, offset) {
            // Extend the first 16 words into the remaining 48 words w[16..63] of the message schedule array
            for (let i = 0; i < 16; i++, offset += 4)
                SHA256_W$1[i] = view.getUint32(offset, false);
            for (let i = 16; i < 64; i++) {
                const W15 = SHA256_W$1[i - 15];
                const W2 = SHA256_W$1[i - 2];
                const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ (W15 >>> 3);
                const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ (W2 >>> 10);
                SHA256_W$1[i] = (s1 + SHA256_W$1[i - 7] + s0 + SHA256_W$1[i - 16]) | 0;
            }
            // Compression function main loop, 64 rounds
            let { A, B, C, D, E, F, G, H } = this;
            for (let i = 0; i < 64; i++) {
                const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
                const T1 = (H + sigma1 + Chi$1(E, F, G) + SHA256_K$1[i] + SHA256_W$1[i]) | 0;
                const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
                const T2 = (sigma0 + Maj$1(A, B, C)) | 0;
                H = G;
                G = F;
                F = E;
                E = (D + T1) | 0;
                D = C;
                C = B;
                B = A;
                A = (T1 + T2) | 0;
            }
            // Add the compressed chunk to the current hash value
            A = (A + this.A) | 0;
            B = (B + this.B) | 0;
            C = (C + this.C) | 0;
            D = (D + this.D) | 0;
            E = (E + this.E) | 0;
            F = (F + this.F) | 0;
            G = (G + this.G) | 0;
            H = (H + this.H) | 0;
            this.set(A, B, C, D, E, F, G, H);
        }
        roundClean() {
            SHA256_W$1.fill(0);
        }
        destroy() {
            this.set(0, 0, 0, 0, 0, 0, 0, 0);
            this.buffer.fill(0);
        }
    };
    // Constants from https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
    let SHA224$1 = class SHA224 extends SHA256$1 {
        constructor() {
            super();
            this.A = 0xc1059ed8 | 0;
            this.B = 0x367cd507 | 0;
            this.C = 0x3070dd17 | 0;
            this.D = 0xf70e5939 | 0;
            this.E = 0xffc00b31 | 0;
            this.F = 0x68581511 | 0;
            this.G = 0x64f98fa7 | 0;
            this.H = 0xbefa4fa4 | 0;
            this.outputLen = 28;
        }
    };
    /**
     * SHA2-256 hash function
     * @param message - data that would be hashed
     */
    const sha256$1 = wrapConstructor(() => new SHA256$1());
    wrapConstructor(() => new SHA224$1());

    /*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    function assertNumber(n) {
        if (!Number.isSafeInteger(n))
            throw new Error(`Wrong integer: ${n}`);
    }
    function chain(...args) {
        const wrap = (a, b) => (c) => a(b(c));
        const encode = Array.from(args)
            .reverse()
            .reduce((acc, i) => (acc ? wrap(acc, i.encode) : i.encode), undefined);
        const decode = args.reduce((acc, i) => (acc ? wrap(acc, i.decode) : i.decode), undefined);
        return { encode, decode };
    }
    function alphabet(alphabet) {
        return {
            encode: (digits) => {
                if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number'))
                    throw new Error('alphabet.encode input should be an array of numbers');
                return digits.map((i) => {
                    assertNumber(i);
                    if (i < 0 || i >= alphabet.length)
                        throw new Error(`Digit index outside alphabet: ${i} (alphabet: ${alphabet.length})`);
                    return alphabet[i];
                });
            },
            decode: (input) => {
                if (!Array.isArray(input) || (input.length && typeof input[0] !== 'string'))
                    throw new Error('alphabet.decode input should be array of strings');
                return input.map((letter) => {
                    if (typeof letter !== 'string')
                        throw new Error(`alphabet.decode: not string element=${letter}`);
                    const index = alphabet.indexOf(letter);
                    if (index === -1)
                        throw new Error(`Unknown letter: "${letter}". Allowed: ${alphabet}`);
                    return index;
                });
            },
        };
    }
    function join$1(separator = '') {
        if (typeof separator !== 'string')
            throw new Error('join separator should be string');
        return {
            encode: (from) => {
                if (!Array.isArray(from) || (from.length && typeof from[0] !== 'string'))
                    throw new Error('join.encode input should be array of strings');
                for (let i of from)
                    if (typeof i !== 'string')
                        throw new Error(`join.encode: non-string input=${i}`);
                return from.join(separator);
            },
            decode: (to) => {
                if (typeof to !== 'string')
                    throw new Error('join.decode input should be string');
                return to.split(separator);
            },
        };
    }
    function padding(bits, chr = '=') {
        assertNumber(bits);
        if (typeof chr !== 'string')
            throw new Error('padding chr should be string');
        return {
            encode(data) {
                if (!Array.isArray(data) || (data.length && typeof data[0] !== 'string'))
                    throw new Error('padding.encode input should be array of strings');
                for (let i of data)
                    if (typeof i !== 'string')
                        throw new Error(`padding.encode: non-string input=${i}`);
                while ((data.length * bits) % 8)
                    data.push(chr);
                return data;
            },
            decode(input) {
                if (!Array.isArray(input) || (input.length && typeof input[0] !== 'string'))
                    throw new Error('padding.encode input should be array of strings');
                for (let i of input)
                    if (typeof i !== 'string')
                        throw new Error(`padding.decode: non-string input=${i}`);
                let end = input.length;
                if ((end * bits) % 8)
                    throw new Error('Invalid padding: string should have whole number of bytes');
                for (; end > 0 && input[end - 1] === chr; end--) {
                    if (!(((end - 1) * bits) % 8))
                        throw new Error('Invalid padding: string has too much padding');
                }
                return input.slice(0, end);
            },
        };
    }
    function normalize$1(fn) {
        if (typeof fn !== 'function')
            throw new Error('normalize fn should be function');
        return { encode: (from) => from, decode: (to) => fn(to) };
    }
    function convertRadix(data, from, to) {
        if (from < 2)
            throw new Error(`convertRadix: wrong from=${from}, base cannot be less than 2`);
        if (to < 2)
            throw new Error(`convertRadix: wrong to=${to}, base cannot be less than 2`);
        if (!Array.isArray(data))
            throw new Error('convertRadix: data should be array');
        if (!data.length)
            return [];
        let pos = 0;
        const res = [];
        const digits = Array.from(data);
        digits.forEach((d) => {
            assertNumber(d);
            if (d < 0 || d >= from)
                throw new Error(`Wrong integer: ${d}`);
        });
        while (true) {
            let carry = 0;
            let done = true;
            for (let i = pos; i < digits.length; i++) {
                const digit = digits[i];
                const digitBase = from * carry + digit;
                if (!Number.isSafeInteger(digitBase) ||
                    (from * carry) / from !== carry ||
                    digitBase - digit !== from * carry) {
                    throw new Error('convertRadix: carry overflow');
                }
                carry = digitBase % to;
                digits[i] = Math.floor(digitBase / to);
                if (!Number.isSafeInteger(digits[i]) || digits[i] * to + carry !== digitBase)
                    throw new Error('convertRadix: carry overflow');
                if (!done)
                    continue;
                else if (!digits[i])
                    pos = i;
                else
                    done = false;
            }
            res.push(carry);
            if (done)
                break;
        }
        for (let i = 0; i < data.length - 1 && data[i] === 0; i++)
            res.push(0);
        return res.reverse();
    }
    const gcd = (a, b) => (!b ? a : gcd(b, a % b));
    const radix2carry = (from, to) => from + (to - gcd(from, to));
    function convertRadix2(data, from, to, padding) {
        if (!Array.isArray(data))
            throw new Error('convertRadix2: data should be array');
        if (from <= 0 || from > 32)
            throw new Error(`convertRadix2: wrong from=${from}`);
        if (to <= 0 || to > 32)
            throw new Error(`convertRadix2: wrong to=${to}`);
        if (radix2carry(from, to) > 32) {
            throw new Error(`convertRadix2: carry overflow from=${from} to=${to} carryBits=${radix2carry(from, to)}`);
        }
        let carry = 0;
        let pos = 0;
        const mask = 2 ** to - 1;
        const res = [];
        for (const n of data) {
            assertNumber(n);
            if (n >= 2 ** from)
                throw new Error(`convertRadix2: invalid data word=${n} from=${from}`);
            carry = (carry << from) | n;
            if (pos + from > 32)
                throw new Error(`convertRadix2: carry overflow pos=${pos} from=${from}`);
            pos += from;
            for (; pos >= to; pos -= to)
                res.push(((carry >> (pos - to)) & mask) >>> 0);
            carry &= 2 ** pos - 1;
        }
        carry = (carry << (to - pos)) & mask;
        if (!padding && pos >= from)
            throw new Error('Excess padding');
        if (!padding && carry)
            throw new Error(`Non-zero padding: ${carry}`);
        if (padding && pos > 0)
            res.push(carry >>> 0);
        return res;
    }
    function radix(num) {
        assertNumber(num);
        return {
            encode: (bytes) => {
                if (!(bytes instanceof Uint8Array))
                    throw new Error('radix.encode input should be Uint8Array');
                return convertRadix(Array.from(bytes), 2 ** 8, num);
            },
            decode: (digits) => {
                if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number'))
                    throw new Error('radix.decode input should be array of strings');
                return Uint8Array.from(convertRadix(digits, num, 2 ** 8));
            },
        };
    }
    function radix2(bits, revPadding = false) {
        assertNumber(bits);
        if (bits <= 0 || bits > 32)
            throw new Error('radix2: bits should be in (0..32]');
        if (radix2carry(8, bits) > 32 || radix2carry(bits, 8) > 32)
            throw new Error('radix2: carry overflow');
        return {
            encode: (bytes) => {
                if (!(bytes instanceof Uint8Array))
                    throw new Error('radix2.encode input should be Uint8Array');
                return convertRadix2(Array.from(bytes), 8, bits, !revPadding);
            },
            decode: (digits) => {
                if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number'))
                    throw new Error('radix2.decode input should be array of strings');
                return Uint8Array.from(convertRadix2(digits, bits, 8, revPadding));
            },
        };
    }
    function unsafeWrapper(fn) {
        if (typeof fn !== 'function')
            throw new Error('unsafeWrapper fn should be function');
        return function (...args) {
            try {
                return fn.apply(null, args);
            }
            catch (e) { }
        };
    }
    function checksum(len, fn) {
        assertNumber(len);
        if (typeof fn !== 'function')
            throw new Error('checksum fn should be function');
        return {
            encode(data) {
                if (!(data instanceof Uint8Array))
                    throw new Error('checksum.encode: input should be Uint8Array');
                const checksum = fn(data).slice(0, len);
                const res = new Uint8Array(data.length + len);
                res.set(data);
                res.set(checksum, data.length);
                return res;
            },
            decode(data) {
                if (!(data instanceof Uint8Array))
                    throw new Error('checksum.decode: input should be Uint8Array');
                const payload = data.slice(0, -len);
                const newChecksum = fn(payload).slice(0, len);
                const oldChecksum = data.slice(-len);
                for (let i = 0; i < len; i++)
                    if (newChecksum[i] !== oldChecksum[i])
                        throw new Error('Invalid checksum');
                return payload;
            },
        };
    }
    const base16 = chain(radix2(4), alphabet('0123456789ABCDEF'), join$1(''));
    const base32 = chain(radix2(5), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'), padding(5), join$1(''));
    chain(radix2(5), alphabet('0123456789ABCDEFGHIJKLMNOPQRSTUV'), padding(5), join$1(''));
    chain(radix2(5), alphabet('0123456789ABCDEFGHJKMNPQRSTVWXYZ'), join$1(''), normalize$1((s) => s.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1')));
    const base64 = chain(radix2(6), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'), padding(6), join$1(''));
    const base64url = chain(radix2(6), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'), padding(6), join$1(''));
    const genBase58 = (abc) => chain(radix(58), alphabet(abc), join$1(''));
    const base58 = genBase58('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz');
    genBase58('123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ');
    genBase58('rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz');
    const XMR_BLOCK_LEN = [0, 2, 3, 5, 6, 7, 9, 10, 11];
    const base58xmr = {
        encode(data) {
            let res = '';
            for (let i = 0; i < data.length; i += 8) {
                const block = data.subarray(i, i + 8);
                res += base58.encode(block).padStart(XMR_BLOCK_LEN[block.length], '1');
            }
            return res;
        },
        decode(str) {
            let res = [];
            for (let i = 0; i < str.length; i += 11) {
                const slice = str.slice(i, i + 11);
                const blockLen = XMR_BLOCK_LEN.indexOf(slice.length);
                const block = base58.decode(slice);
                for (let j = 0; j < block.length - blockLen; j++) {
                    if (block[j] !== 0)
                        throw new Error('base58xmr: wrong padding');
                }
                res = res.concat(Array.from(block.slice(block.length - blockLen)));
            }
            return Uint8Array.from(res);
        },
    };
    const base58check$1 = (sha256) => chain(checksum(4, (data) => sha256(sha256(data))), base58);
    const BECH_ALPHABET = chain(alphabet('qpzry9x8gf2tvdw0s3jn54khce6mua7l'), join$1(''));
    const POLYMOD_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    function bech32Polymod(pre) {
        const b = pre >> 25;
        let chk = (pre & 0x1ffffff) << 5;
        for (let i = 0; i < POLYMOD_GENERATORS.length; i++) {
            if (((b >> i) & 1) === 1)
                chk ^= POLYMOD_GENERATORS[i];
        }
        return chk;
    }
    function bechChecksum(prefix, words, encodingConst = 1) {
        const len = prefix.length;
        let chk = 1;
        for (let i = 0; i < len; i++) {
            const c = prefix.charCodeAt(i);
            if (c < 33 || c > 126)
                throw new Error(`Invalid prefix (${prefix})`);
            chk = bech32Polymod(chk) ^ (c >> 5);
        }
        chk = bech32Polymod(chk);
        for (let i = 0; i < len; i++)
            chk = bech32Polymod(chk) ^ (prefix.charCodeAt(i) & 0x1f);
        for (let v of words)
            chk = bech32Polymod(chk) ^ v;
        for (let i = 0; i < 6; i++)
            chk = bech32Polymod(chk);
        chk ^= encodingConst;
        return BECH_ALPHABET.encode(convertRadix2([chk % 2 ** 30], 30, 5, false));
    }
    function genBech32(encoding) {
        const ENCODING_CONST = encoding === 'bech32' ? 1 : 0x2bc830a3;
        const _words = radix2(5);
        const fromWords = _words.decode;
        const toWords = _words.encode;
        const fromWordsUnsafe = unsafeWrapper(fromWords);
        function encode(prefix, words, limit = 90) {
            if (typeof prefix !== 'string')
                throw new Error(`bech32.encode prefix should be string, not ${typeof prefix}`);
            if (!Array.isArray(words) || (words.length && typeof words[0] !== 'number'))
                throw new Error(`bech32.encode words should be array of numbers, not ${typeof words}`);
            const actualLength = prefix.length + 7 + words.length;
            if (limit !== false && actualLength > limit)
                throw new TypeError(`Length ${actualLength} exceeds limit ${limit}`);
            prefix = prefix.toLowerCase();
            return `${prefix}1${BECH_ALPHABET.encode(words)}${bechChecksum(prefix, words, ENCODING_CONST)}`;
        }
        function decode(str, limit = 90) {
            if (typeof str !== 'string')
                throw new Error(`bech32.decode input should be string, not ${typeof str}`);
            if (str.length < 8 || (limit !== false && str.length > limit))
                throw new TypeError(`Wrong string length: ${str.length} (${str}). Expected (8..${limit})`);
            const lowered = str.toLowerCase();
            if (str !== lowered && str !== str.toUpperCase())
                throw new Error(`String must be lowercase or uppercase`);
            str = lowered;
            const sepIndex = str.lastIndexOf('1');
            if (sepIndex === 0 || sepIndex === -1)
                throw new Error(`Letter "1" must be present between prefix and data only`);
            const prefix = str.slice(0, sepIndex);
            const _words = str.slice(sepIndex + 1);
            if (_words.length < 6)
                throw new Error('Data must be at least 6 characters long');
            const words = BECH_ALPHABET.decode(_words).slice(0, -6);
            const sum = bechChecksum(prefix, words, ENCODING_CONST);
            if (!_words.endsWith(sum))
                throw new Error(`Invalid checksum in ${str}: expected "${sum}"`);
            return { prefix, words };
        }
        const decodeUnsafe = unsafeWrapper(decode);
        function decodeToBytes(str) {
            const { prefix, words } = decode(str, false);
            return { prefix, words, bytes: fromWords(words) };
        }
        return { encode, decode, decodeToBytes, decodeUnsafe, fromWords, fromWordsUnsafe, toWords };
    }
    const bech32 = genBech32('bech32');
    genBech32('bech32m');
    const utf8 = {
        encode: (data) => new TextDecoder().decode(data),
        decode: (str) => new TextEncoder().encode(str),
    };
    const hex = chain(radix2(4), alphabet('0123456789abcdef'), join$1(''), normalize$1((s) => {
        if (typeof s !== 'string' || s.length % 2)
            throw new TypeError(`hex.decode: expected string, got ${typeof s} with length ${s.length}`);
        return s.toLowerCase();
    }));
    const CODERS = {
        utf8, hex, base16, base32, base64, base64url, base58, base58xmr
    };
`Invalid encoding type. Available types: ${Object.keys(CODERS).join(', ')}`;

    var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

    var english = {};

    Object.defineProperty(english, "__esModule", { value: true });
    var wordlist = english.wordlist = void 0;
    wordlist = english.wordlist = `abandon
ability
able
about
above
absent
absorb
abstract
absurd
abuse
access
accident
account
accuse
achieve
acid
acoustic
acquire
across
act
action
actor
actress
actual
adapt
add
addict
address
adjust
admit
adult
advance
advice
aerobic
affair
afford
afraid
again
age
agent
agree
ahead
aim
air
airport
aisle
alarm
album
alcohol
alert
alien
all
alley
allow
almost
alone
alpha
already
also
alter
always
amateur
amazing
among
amount
amused
analyst
anchor
ancient
anger
angle
angry
animal
ankle
announce
annual
another
answer
antenna
antique
anxiety
any
apart
apology
appear
apple
approve
april
arch
arctic
area
arena
argue
arm
armed
armor
army
around
arrange
arrest
arrive
arrow
art
artefact
artist
artwork
ask
aspect
assault
asset
assist
assume
asthma
athlete
atom
attack
attend
attitude
attract
auction
audit
august
aunt
author
auto
autumn
average
avocado
avoid
awake
aware
away
awesome
awful
awkward
axis
baby
bachelor
bacon
badge
bag
balance
balcony
ball
bamboo
banana
banner
bar
barely
bargain
barrel
base
basic
basket
battle
beach
bean
beauty
because
become
beef
before
begin
behave
behind
believe
below
belt
bench
benefit
best
betray
better
between
beyond
bicycle
bid
bike
bind
biology
bird
birth
bitter
black
blade
blame
blanket
blast
bleak
bless
blind
blood
blossom
blouse
blue
blur
blush
board
boat
body
boil
bomb
bone
bonus
book
boost
border
boring
borrow
boss
bottom
bounce
box
boy
bracket
brain
brand
brass
brave
bread
breeze
brick
bridge
brief
bright
bring
brisk
broccoli
broken
bronze
broom
brother
brown
brush
bubble
buddy
budget
buffalo
build
bulb
bulk
bullet
bundle
bunker
burden
burger
burst
bus
business
busy
butter
buyer
buzz
cabbage
cabin
cable
cactus
cage
cake
call
calm
camera
camp
can
canal
cancel
candy
cannon
canoe
canvas
canyon
capable
capital
captain
car
carbon
card
cargo
carpet
carry
cart
case
cash
casino
castle
casual
cat
catalog
catch
category
cattle
caught
cause
caution
cave
ceiling
celery
cement
census
century
cereal
certain
chair
chalk
champion
change
chaos
chapter
charge
chase
chat
cheap
check
cheese
chef
cherry
chest
chicken
chief
child
chimney
choice
choose
chronic
chuckle
chunk
churn
cigar
cinnamon
circle
citizen
city
civil
claim
clap
clarify
claw
clay
clean
clerk
clever
click
client
cliff
climb
clinic
clip
clock
clog
close
cloth
cloud
clown
club
clump
cluster
clutch
coach
coast
coconut
code
coffee
coil
coin
collect
color
column
combine
come
comfort
comic
common
company
concert
conduct
confirm
congress
connect
consider
control
convince
cook
cool
copper
copy
coral
core
corn
correct
cost
cotton
couch
country
couple
course
cousin
cover
coyote
crack
cradle
craft
cram
crane
crash
crater
crawl
crazy
cream
credit
creek
crew
cricket
crime
crisp
critic
crop
cross
crouch
crowd
crucial
cruel
cruise
crumble
crunch
crush
cry
crystal
cube
culture
cup
cupboard
curious
current
curtain
curve
cushion
custom
cute
cycle
dad
damage
damp
dance
danger
daring
dash
daughter
dawn
day
deal
debate
debris
decade
december
decide
decline
decorate
decrease
deer
defense
define
defy
degree
delay
deliver
demand
demise
denial
dentist
deny
depart
depend
deposit
depth
deputy
derive
describe
desert
design
desk
despair
destroy
detail
detect
develop
device
devote
diagram
dial
diamond
diary
dice
diesel
diet
differ
digital
dignity
dilemma
dinner
dinosaur
direct
dirt
disagree
discover
disease
dish
dismiss
disorder
display
distance
divert
divide
divorce
dizzy
doctor
document
dog
doll
dolphin
domain
donate
donkey
donor
door
dose
double
dove
draft
dragon
drama
drastic
draw
dream
dress
drift
drill
drink
drip
drive
drop
drum
dry
duck
dumb
dune
during
dust
dutch
duty
dwarf
dynamic
eager
eagle
early
earn
earth
easily
east
easy
echo
ecology
economy
edge
edit
educate
effort
egg
eight
either
elbow
elder
electric
elegant
element
elephant
elevator
elite
else
embark
embody
embrace
emerge
emotion
employ
empower
empty
enable
enact
end
endless
endorse
enemy
energy
enforce
engage
engine
enhance
enjoy
enlist
enough
enrich
enroll
ensure
enter
entire
entry
envelope
episode
equal
equip
era
erase
erode
erosion
error
erupt
escape
essay
essence
estate
eternal
ethics
evidence
evil
evoke
evolve
exact
example
excess
exchange
excite
exclude
excuse
execute
exercise
exhaust
exhibit
exile
exist
exit
exotic
expand
expect
expire
explain
expose
express
extend
extra
eye
eyebrow
fabric
face
faculty
fade
faint
faith
fall
false
fame
family
famous
fan
fancy
fantasy
farm
fashion
fat
fatal
father
fatigue
fault
favorite
feature
february
federal
fee
feed
feel
female
fence
festival
fetch
fever
few
fiber
fiction
field
figure
file
film
filter
final
find
fine
finger
finish
fire
firm
first
fiscal
fish
fit
fitness
fix
flag
flame
flash
flat
flavor
flee
flight
flip
float
flock
floor
flower
fluid
flush
fly
foam
focus
fog
foil
fold
follow
food
foot
force
forest
forget
fork
fortune
forum
forward
fossil
foster
found
fox
fragile
frame
frequent
fresh
friend
fringe
frog
front
frost
frown
frozen
fruit
fuel
fun
funny
furnace
fury
future
gadget
gain
galaxy
gallery
game
gap
garage
garbage
garden
garlic
garment
gas
gasp
gate
gather
gauge
gaze
general
genius
genre
gentle
genuine
gesture
ghost
giant
gift
giggle
ginger
giraffe
girl
give
glad
glance
glare
glass
glide
glimpse
globe
gloom
glory
glove
glow
glue
goat
goddess
gold
good
goose
gorilla
gospel
gossip
govern
gown
grab
grace
grain
grant
grape
grass
gravity
great
green
grid
grief
grit
grocery
group
grow
grunt
guard
guess
guide
guilt
guitar
gun
gym
habit
hair
half
hammer
hamster
hand
happy
harbor
hard
harsh
harvest
hat
have
hawk
hazard
head
health
heart
heavy
hedgehog
height
hello
helmet
help
hen
hero
hidden
high
hill
hint
hip
hire
history
hobby
hockey
hold
hole
holiday
hollow
home
honey
hood
hope
horn
horror
horse
hospital
host
hotel
hour
hover
hub
huge
human
humble
humor
hundred
hungry
hunt
hurdle
hurry
hurt
husband
hybrid
ice
icon
idea
identify
idle
ignore
ill
illegal
illness
image
imitate
immense
immune
impact
impose
improve
impulse
inch
include
income
increase
index
indicate
indoor
industry
infant
inflict
inform
inhale
inherit
initial
inject
injury
inmate
inner
innocent
input
inquiry
insane
insect
inside
inspire
install
intact
interest
into
invest
invite
involve
iron
island
isolate
issue
item
ivory
jacket
jaguar
jar
jazz
jealous
jeans
jelly
jewel
job
join
joke
journey
joy
judge
juice
jump
jungle
junior
junk
just
kangaroo
keen
keep
ketchup
key
kick
kid
kidney
kind
kingdom
kiss
kit
kitchen
kite
kitten
kiwi
knee
knife
knock
know
lab
label
labor
ladder
lady
lake
lamp
language
laptop
large
later
latin
laugh
laundry
lava
law
lawn
lawsuit
layer
lazy
leader
leaf
learn
leave
lecture
left
leg
legal
legend
leisure
lemon
lend
length
lens
leopard
lesson
letter
level
liar
liberty
library
license
life
lift
light
like
limb
limit
link
lion
liquid
list
little
live
lizard
load
loan
lobster
local
lock
logic
lonely
long
loop
lottery
loud
lounge
love
loyal
lucky
luggage
lumber
lunar
lunch
luxury
lyrics
machine
mad
magic
magnet
maid
mail
main
major
make
mammal
man
manage
mandate
mango
mansion
manual
maple
marble
march
margin
marine
market
marriage
mask
mass
master
match
material
math
matrix
matter
maximum
maze
meadow
mean
measure
meat
mechanic
medal
media
melody
melt
member
memory
mention
menu
mercy
merge
merit
merry
mesh
message
metal
method
middle
midnight
milk
million
mimic
mind
minimum
minor
minute
miracle
mirror
misery
miss
mistake
mix
mixed
mixture
mobile
model
modify
mom
moment
monitor
monkey
monster
month
moon
moral
more
morning
mosquito
mother
motion
motor
mountain
mouse
move
movie
much
muffin
mule
multiply
muscle
museum
mushroom
music
must
mutual
myself
mystery
myth
naive
name
napkin
narrow
nasty
nation
nature
near
neck
need
negative
neglect
neither
nephew
nerve
nest
net
network
neutral
never
news
next
nice
night
noble
noise
nominee
noodle
normal
north
nose
notable
note
nothing
notice
novel
now
nuclear
number
nurse
nut
oak
obey
object
oblige
obscure
observe
obtain
obvious
occur
ocean
october
odor
off
offer
office
often
oil
okay
old
olive
olympic
omit
once
one
onion
online
only
open
opera
opinion
oppose
option
orange
orbit
orchard
order
ordinary
organ
orient
original
orphan
ostrich
other
outdoor
outer
output
outside
oval
oven
over
own
owner
oxygen
oyster
ozone
pact
paddle
page
pair
palace
palm
panda
panel
panic
panther
paper
parade
parent
park
parrot
party
pass
patch
path
patient
patrol
pattern
pause
pave
payment
peace
peanut
pear
peasant
pelican
pen
penalty
pencil
people
pepper
perfect
permit
person
pet
phone
photo
phrase
physical
piano
picnic
picture
piece
pig
pigeon
pill
pilot
pink
pioneer
pipe
pistol
pitch
pizza
place
planet
plastic
plate
play
please
pledge
pluck
plug
plunge
poem
poet
point
polar
pole
police
pond
pony
pool
popular
portion
position
possible
post
potato
pottery
poverty
powder
power
practice
praise
predict
prefer
prepare
present
pretty
prevent
price
pride
primary
print
priority
prison
private
prize
problem
process
produce
profit
program
project
promote
proof
property
prosper
protect
proud
provide
public
pudding
pull
pulp
pulse
pumpkin
punch
pupil
puppy
purchase
purity
purpose
purse
push
put
puzzle
pyramid
quality
quantum
quarter
question
quick
quit
quiz
quote
rabbit
raccoon
race
rack
radar
radio
rail
rain
raise
rally
ramp
ranch
random
range
rapid
rare
rate
rather
raven
raw
razor
ready
real
reason
rebel
rebuild
recall
receive
recipe
record
recycle
reduce
reflect
reform
refuse
region
regret
regular
reject
relax
release
relief
rely
remain
remember
remind
remove
render
renew
rent
reopen
repair
repeat
replace
report
require
rescue
resemble
resist
resource
response
result
retire
retreat
return
reunion
reveal
review
reward
rhythm
rib
ribbon
rice
rich
ride
ridge
rifle
right
rigid
ring
riot
ripple
risk
ritual
rival
river
road
roast
robot
robust
rocket
romance
roof
rookie
room
rose
rotate
rough
round
route
royal
rubber
rude
rug
rule
run
runway
rural
sad
saddle
sadness
safe
sail
salad
salmon
salon
salt
salute
same
sample
sand
satisfy
satoshi
sauce
sausage
save
say
scale
scan
scare
scatter
scene
scheme
school
science
scissors
scorpion
scout
scrap
screen
script
scrub
sea
search
season
seat
second
secret
section
security
seed
seek
segment
select
sell
seminar
senior
sense
sentence
series
service
session
settle
setup
seven
shadow
shaft
shallow
share
shed
shell
sheriff
shield
shift
shine
ship
shiver
shock
shoe
shoot
shop
short
shoulder
shove
shrimp
shrug
shuffle
shy
sibling
sick
side
siege
sight
sign
silent
silk
silly
silver
similar
simple
since
sing
siren
sister
situate
six
size
skate
sketch
ski
skill
skin
skirt
skull
slab
slam
sleep
slender
slice
slide
slight
slim
slogan
slot
slow
slush
small
smart
smile
smoke
smooth
snack
snake
snap
sniff
snow
soap
soccer
social
sock
soda
soft
solar
soldier
solid
solution
solve
someone
song
soon
sorry
sort
soul
sound
soup
source
south
space
spare
spatial
spawn
speak
special
speed
spell
spend
sphere
spice
spider
spike
spin
spirit
split
spoil
sponsor
spoon
sport
spot
spray
spread
spring
spy
square
squeeze
squirrel
stable
stadium
staff
stage
stairs
stamp
stand
start
state
stay
steak
steel
stem
step
stereo
stick
still
sting
stock
stomach
stone
stool
story
stove
strategy
street
strike
strong
struggle
student
stuff
stumble
style
subject
submit
subway
success
such
sudden
suffer
sugar
suggest
suit
summer
sun
sunny
sunset
super
supply
supreme
sure
surface
surge
surprise
surround
survey
suspect
sustain
swallow
swamp
swap
swarm
swear
sweet
swift
swim
swing
switch
sword
symbol
symptom
syrup
system
table
tackle
tag
tail
talent
talk
tank
tape
target
task
taste
tattoo
taxi
teach
team
tell
ten
tenant
tennis
tent
term
test
text
thank
that
theme
then
theory
there
they
thing
this
thought
three
thrive
throw
thumb
thunder
ticket
tide
tiger
tilt
timber
time
tiny
tip
tired
tissue
title
toast
tobacco
today
toddler
toe
together
toilet
token
tomato
tomorrow
tone
tongue
tonight
tool
tooth
top
topic
topple
torch
tornado
tortoise
toss
total
tourist
toward
tower
town
toy
track
trade
traffic
tragic
train
transfer
trap
trash
travel
tray
treat
tree
trend
trial
tribe
trick
trigger
trim
trip
trophy
trouble
truck
true
truly
trumpet
trust
truth
try
tube
tuition
tumble
tuna
tunnel
turkey
turn
turtle
twelve
twenty
twice
twin
twist
two
type
typical
ugly
umbrella
unable
unaware
uncle
uncover
under
undo
unfair
unfold
unhappy
uniform
unique
unit
universe
unknown
unlock
until
unusual
unveil
update
upgrade
uphold
upon
upper
upset
urban
urge
usage
use
used
useful
useless
usual
utility
vacant
vacuum
vague
valid
valley
valve
van
vanish
vapor
various
vast
vault
vehicle
velvet
vendor
venture
venue
verb
verify
version
very
vessel
veteran
viable
vibrant
vicious
victory
video
view
village
vintage
violin
virtual
virus
visa
visit
visual
vital
vivid
vocal
voice
void
volcano
volume
vote
voyage
wage
wagon
wait
walk
wall
walnut
want
warfare
warm
warrior
wash
wasp
waste
water
wave
way
wealth
weapon
wear
weasel
weather
web
wedding
weekend
weird
welcome
west
wet
whale
what
wheat
wheel
when
where
whip
whisper
wide
width
wife
wild
will
win
window
wine
wing
wink
winner
winter
wire
wisdom
wise
wish
witness
wolf
woman
wonder
wood
wool
word
work
world
worry
worth
wrap
wreck
wrestle
wrist
write
wrong
yard
year
yellow
you
young
youth
zebra
zero
zone
zoo`.split('\n');

    var bip39 = {};

    var _assert = {};

    Object.defineProperty(_assert, "__esModule", { value: true });
    _assert.output = _assert.exists = _assert.hash = _assert.bytes = _assert.bool = _assert.number = void 0;
    function number(n) {
        if (!Number.isSafeInteger(n) || n < 0)
            throw new Error(`Wrong positive integer: ${n}`);
    }
    _assert.number = number;
    function bool(b) {
        if (typeof b !== 'boolean')
            throw new Error(`Expected boolean, not ${b}`);
    }
    _assert.bool = bool;
    function bytes(b, ...lengths) {
        if (!(b instanceof Uint8Array))
            throw new TypeError('Expected Uint8Array');
        if (lengths.length > 0 && !lengths.includes(b.length))
            throw new TypeError(`Expected Uint8Array of length ${lengths}, not of length=${b.length}`);
    }
    _assert.bytes = bytes;
    function hash$1(hash) {
        if (typeof hash !== 'function' || typeof hash.create !== 'function')
            throw new Error('Hash should be wrapped by utils.wrapConstructor');
        number(hash.outputLen);
        number(hash.blockLen);
    }
    _assert.hash = hash$1;
    function exists(instance, checkFinished = true) {
        if (instance.destroyed)
            throw new Error('Hash instance has been destroyed');
        if (checkFinished && instance.finished)
            throw new Error('Hash#digest() has already been called');
    }
    _assert.exists = exists;
    function output(out, instance) {
        bytes(out);
        const min = instance.outputLen;
        if (out.length < min) {
            throw new Error(`digestInto() expects output buffer of length at least ${min}`);
        }
    }
    _assert.output = output;
    const assert$1 = {
        number,
        bool,
        bytes,
        hash: hash$1,
        exists,
        output,
    };
    _assert.default = assert$1;

    var pbkdf2$1 = {};

    var hmac$1 = {};

    var utils = {};

    var cryptoBrowser = {};

    Object.defineProperty(cryptoBrowser, "__esModule", { value: true });
    cryptoBrowser.crypto = void 0;
    cryptoBrowser.crypto = {
        node: undefined,
        web: typeof self === 'object' && 'crypto' in self ? self.crypto : undefined,
    };

    (function (exports) {
    	/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    	Object.defineProperty(exports, "__esModule", { value: true });
    	exports.randomBytes = exports.wrapConstructorWithOpts = exports.wrapConstructor = exports.checkOpts = exports.Hash = exports.concatBytes = exports.toBytes = exports.utf8ToBytes = exports.asyncLoop = exports.nextTick = exports.hexToBytes = exports.bytesToHex = exports.isLE = exports.rotr = exports.createView = exports.u32 = exports.u8 = void 0;
    	// The import here is via the package name. This is to ensure
    	// that exports mapping/resolution does fall into place.
    	const crypto_1 = cryptoBrowser;
    	// Cast array to different type
    	const u8 = (arr) => new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    	exports.u8 = u8;
    	const u32 = (arr) => new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
    	exports.u32 = u32;
    	// Cast array to view
    	const createView = (arr) => new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
    	exports.createView = createView;
    	// The rotate right (circular right shift) operation for uint32
    	const rotr = (word, shift) => (word << (32 - shift)) | (word >>> shift);
    	exports.rotr = rotr;
    	exports.isLE = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
    	// There is almost no big endian hardware, but js typed arrays uses platform specific endianness.
    	// So, just to be sure not to corrupt anything.
    	if (!exports.isLE)
    	    throw new Error('Non little-endian hardware is not supported');
    	const hexes = Array.from({ length: 256 }, (v, i) => i.toString(16).padStart(2, '0'));
    	/**
    	 * @example bytesToHex(Uint8Array.from([0xde, 0xad, 0xbe, 0xef]))
    	 */
    	function bytesToHex(uint8a) {
    	    // pre-caching improves the speed 6x
    	    if (!(uint8a instanceof Uint8Array))
    	        throw new Error('Uint8Array expected');
    	    let hex = '';
    	    for (let i = 0; i < uint8a.length; i++) {
    	        hex += hexes[uint8a[i]];
    	    }
    	    return hex;
    	}
    	exports.bytesToHex = bytesToHex;
    	/**
    	 * @example hexToBytes('deadbeef')
    	 */
    	function hexToBytes(hex) {
    	    if (typeof hex !== 'string') {
    	        throw new TypeError('hexToBytes: expected string, got ' + typeof hex);
    	    }
    	    if (hex.length % 2)
    	        throw new Error('hexToBytes: received invalid unpadded hex');
    	    const array = new Uint8Array(hex.length / 2);
    	    for (let i = 0; i < array.length; i++) {
    	        const j = i * 2;
    	        const hexByte = hex.slice(j, j + 2);
    	        const byte = Number.parseInt(hexByte, 16);
    	        if (Number.isNaN(byte) || byte < 0)
    	            throw new Error('Invalid byte sequence');
    	        array[i] = byte;
    	    }
    	    return array;
    	}
    	exports.hexToBytes = hexToBytes;
    	// There is no setImmediate in browser and setTimeout is slow. However, call to async function will return Promise
    	// which will be fullfiled only on next scheduler queue processing step and this is exactly what we need.
    	const nextTick = async () => { };
    	exports.nextTick = nextTick;
    	// Returns control to thread each 'tick' ms to avoid blocking
    	async function asyncLoop(iters, tick, cb) {
    	    let ts = Date.now();
    	    for (let i = 0; i < iters; i++) {
    	        cb(i);
    	        // Date.now() is not monotonic, so in case if clock goes backwards we return return control too
    	        const diff = Date.now() - ts;
    	        if (diff >= 0 && diff < tick)
    	            continue;
    	        await (0, exports.nextTick)();
    	        ts += diff;
    	    }
    	}
    	exports.asyncLoop = asyncLoop;
    	function utf8ToBytes(str) {
    	    if (typeof str !== 'string') {
    	        throw new TypeError(`utf8ToBytes expected string, got ${typeof str}`);
    	    }
    	    return new TextEncoder().encode(str);
    	}
    	exports.utf8ToBytes = utf8ToBytes;
    	function toBytes(data) {
    	    if (typeof data === 'string')
    	        data = utf8ToBytes(data);
    	    if (!(data instanceof Uint8Array))
    	        throw new TypeError(`Expected input type is Uint8Array (got ${typeof data})`);
    	    return data;
    	}
    	exports.toBytes = toBytes;
    	/**
    	 * Concats Uint8Array-s into one; like `Buffer.concat([buf1, buf2])`
    	 * @example concatBytes(buf1, buf2)
    	 */
    	function concatBytes(...arrays) {
    	    if (!arrays.every((a) => a instanceof Uint8Array))
    	        throw new Error('Uint8Array list expected');
    	    if (arrays.length === 1)
    	        return arrays[0];
    	    const length = arrays.reduce((a, arr) => a + arr.length, 0);
    	    const result = new Uint8Array(length);
    	    for (let i = 0, pad = 0; i < arrays.length; i++) {
    	        const arr = arrays[i];
    	        result.set(arr, pad);
    	        pad += arr.length;
    	    }
    	    return result;
    	}
    	exports.concatBytes = concatBytes;
    	// For runtime check if class implements interface
    	class Hash {
    	    // Safe version that clones internal state
    	    clone() {
    	        return this._cloneInto();
    	    }
    	}
    	exports.Hash = Hash;
    	// Check if object doens't have custom constructor (like Uint8Array/Array)
    	const isPlainObject = (obj) => Object.prototype.toString.call(obj) === '[object Object]' && obj.constructor === Object;
    	function checkOpts(defaults, opts) {
    	    if (opts !== undefined && (typeof opts !== 'object' || !isPlainObject(opts)))
    	        throw new TypeError('Options should be object or undefined');
    	    const merged = Object.assign(defaults, opts);
    	    return merged;
    	}
    	exports.checkOpts = checkOpts;
    	function wrapConstructor(hashConstructor) {
    	    const hashC = (message) => hashConstructor().update(toBytes(message)).digest();
    	    const tmp = hashConstructor();
    	    hashC.outputLen = tmp.outputLen;
    	    hashC.blockLen = tmp.blockLen;
    	    hashC.create = () => hashConstructor();
    	    return hashC;
    	}
    	exports.wrapConstructor = wrapConstructor;
    	function wrapConstructorWithOpts(hashCons) {
    	    const hashC = (msg, opts) => hashCons(opts).update(toBytes(msg)).digest();
    	    const tmp = hashCons({});
    	    hashC.outputLen = tmp.outputLen;
    	    hashC.blockLen = tmp.blockLen;
    	    hashC.create = (opts) => hashCons(opts);
    	    return hashC;
    	}
    	exports.wrapConstructorWithOpts = wrapConstructorWithOpts;
    	/**
    	 * Secure PRNG
    	 */
    	function randomBytes(bytesLength = 32) {
    	    if (crypto_1.crypto.web) {
    	        return crypto_1.crypto.web.getRandomValues(new Uint8Array(bytesLength));
    	    }
    	    else if (crypto_1.crypto.node) {
    	        return new Uint8Array(crypto_1.crypto.node.randomBytes(bytesLength).buffer);
    	    }
    	    else {
    	        throw new Error("The environment doesn't have randomBytes function");
    	    }
    	}
    	exports.randomBytes = randomBytes;
    	
    } (utils));

    (function (exports) {
    	Object.defineProperty(exports, "__esModule", { value: true });
    	exports.hmac = void 0;
    	const _assert_js_1 = _assert;
    	const utils_js_1 = utils;
    	// HMAC (RFC 2104)
    	class HMAC extends utils_js_1.Hash {
    	    constructor(hash, _key) {
    	        super();
    	        this.finished = false;
    	        this.destroyed = false;
    	        _assert_js_1.default.hash(hash);
    	        const key = (0, utils_js_1.toBytes)(_key);
    	        this.iHash = hash.create();
    	        if (typeof this.iHash.update !== 'function')
    	            throw new TypeError('Expected instance of class which extends utils.Hash');
    	        this.blockLen = this.iHash.blockLen;
    	        this.outputLen = this.iHash.outputLen;
    	        const blockLen = this.blockLen;
    	        const pad = new Uint8Array(blockLen);
    	        // blockLen can be bigger than outputLen
    	        pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
    	        for (let i = 0; i < pad.length; i++)
    	            pad[i] ^= 0x36;
    	        this.iHash.update(pad);
    	        // By doing update (processing of first block) of outer hash here we can re-use it between multiple calls via clone
    	        this.oHash = hash.create();
    	        // Undo internal XOR && apply outer XOR
    	        for (let i = 0; i < pad.length; i++)
    	            pad[i] ^= 0x36 ^ 0x5c;
    	        this.oHash.update(pad);
    	        pad.fill(0);
    	    }
    	    update(buf) {
    	        _assert_js_1.default.exists(this);
    	        this.iHash.update(buf);
    	        return this;
    	    }
    	    digestInto(out) {
    	        _assert_js_1.default.exists(this);
    	        _assert_js_1.default.bytes(out, this.outputLen);
    	        this.finished = true;
    	        this.iHash.digestInto(out);
    	        this.oHash.update(out);
    	        this.oHash.digestInto(out);
    	        this.destroy();
    	    }
    	    digest() {
    	        const out = new Uint8Array(this.oHash.outputLen);
    	        this.digestInto(out);
    	        return out;
    	    }
    	    _cloneInto(to) {
    	        // Create new instance without calling constructor since key already in state and we don't know it.
    	        to || (to = Object.create(Object.getPrototypeOf(this), {}));
    	        const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
    	        to = to;
    	        to.finished = finished;
    	        to.destroyed = destroyed;
    	        to.blockLen = blockLen;
    	        to.outputLen = outputLen;
    	        to.oHash = oHash._cloneInto(to.oHash);
    	        to.iHash = iHash._cloneInto(to.iHash);
    	        return to;
    	    }
    	    destroy() {
    	        this.destroyed = true;
    	        this.oHash.destroy();
    	        this.iHash.destroy();
    	    }
    	}
    	/**
    	 * HMAC: RFC2104 message authentication code.
    	 * @param hash - function that would be used e.g. sha256
    	 * @param key - message key
    	 * @param message - message data
    	 */
    	const hmac = (hash, key, message) => new HMAC(hash, key).update(message).digest();
    	exports.hmac = hmac;
    	exports.hmac.create = (hash, key) => new HMAC(hash, key);
    	
    } (hmac$1));

    Object.defineProperty(pbkdf2$1, "__esModule", { value: true });
    pbkdf2$1.pbkdf2Async = pbkdf2$1.pbkdf2 = void 0;
    const _assert_js_1$1 = _assert;
    const hmac_js_1 = hmac$1;
    const utils_js_1$3 = utils;
    // Common prologue and epilogue for sync/async functions
    function pbkdf2Init(hash, _password, _salt, _opts) {
        _assert_js_1$1.default.hash(hash);
        const opts = (0, utils_js_1$3.checkOpts)({ dkLen: 32, asyncTick: 10 }, _opts);
        const { c, dkLen, asyncTick } = opts;
        _assert_js_1$1.default.number(c);
        _assert_js_1$1.default.number(dkLen);
        _assert_js_1$1.default.number(asyncTick);
        if (c < 1)
            throw new Error('PBKDF2: iterations (c) should be >= 1');
        const password = (0, utils_js_1$3.toBytes)(_password);
        const salt = (0, utils_js_1$3.toBytes)(_salt);
        // DK = PBKDF2(PRF, Password, Salt, c, dkLen);
        const DK = new Uint8Array(dkLen);
        // U1 = PRF(Password, Salt + INT_32_BE(i))
        const PRF = hmac_js_1.hmac.create(hash, password);
        const PRFSalt = PRF._cloneInto().update(salt);
        return { c, dkLen, asyncTick, DK, PRF, PRFSalt };
    }
    function pbkdf2Output(PRF, PRFSalt, DK, prfW, u) {
        PRF.destroy();
        PRFSalt.destroy();
        if (prfW)
            prfW.destroy();
        u.fill(0);
        return DK;
    }
    /**
     * PBKDF2-HMAC: RFC 2898 key derivation function
     * @param hash - hash function that would be used e.g. sha256
     * @param password - password from which a derived key is generated
     * @param salt - cryptographic salt
     * @param opts - {c, dkLen} where c is work factor and dkLen is output message size
     */
    function pbkdf2(hash, password, salt, opts) {
        const { c, dkLen, DK, PRF, PRFSalt } = pbkdf2Init(hash, password, salt, opts);
        let prfW; // Working copy
        const arr = new Uint8Array(4);
        const view = (0, utils_js_1$3.createView)(arr);
        const u = new Uint8Array(PRF.outputLen);
        // DK = T1 + T2 + ⋯ + Tdklen/hlen
        for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += PRF.outputLen) {
            // Ti = F(Password, Salt, c, i)
            const Ti = DK.subarray(pos, pos + PRF.outputLen);
            view.setInt32(0, ti, false);
            // F(Password, Salt, c, i) = U1 ^ U2 ^ ⋯ ^ Uc
            // U1 = PRF(Password, Salt + INT_32_BE(i))
            (prfW = PRFSalt._cloneInto(prfW)).update(arr).digestInto(u);
            Ti.set(u.subarray(0, Ti.length));
            for (let ui = 1; ui < c; ui++) {
                // Uc = PRF(Password, Uc−1)
                PRF._cloneInto(prfW).update(u).digestInto(u);
                for (let i = 0; i < Ti.length; i++)
                    Ti[i] ^= u[i];
            }
        }
        return pbkdf2Output(PRF, PRFSalt, DK, prfW, u);
    }
    pbkdf2$1.pbkdf2 = pbkdf2;
    async function pbkdf2Async(hash, password, salt, opts) {
        const { c, dkLen, asyncTick, DK, PRF, PRFSalt } = pbkdf2Init(hash, password, salt, opts);
        let prfW; // Working copy
        const arr = new Uint8Array(4);
        const view = (0, utils_js_1$3.createView)(arr);
        const u = new Uint8Array(PRF.outputLen);
        // DK = T1 + T2 + ⋯ + Tdklen/hlen
        for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += PRF.outputLen) {
            // Ti = F(Password, Salt, c, i)
            const Ti = DK.subarray(pos, pos + PRF.outputLen);
            view.setInt32(0, ti, false);
            // F(Password, Salt, c, i) = U1 ^ U2 ^ ⋯ ^ Uc
            // U1 = PRF(Password, Salt + INT_32_BE(i))
            (prfW = PRFSalt._cloneInto(prfW)).update(arr).digestInto(u);
            Ti.set(u.subarray(0, Ti.length));
            await (0, utils_js_1$3.asyncLoop)(c - 1, asyncTick, (i) => {
                // Uc = PRF(Password, Uc−1)
                PRF._cloneInto(prfW).update(u).digestInto(u);
                for (let i = 0; i < Ti.length; i++)
                    Ti[i] ^= u[i];
            });
        }
        return pbkdf2Output(PRF, PRFSalt, DK, prfW, u);
    }
    pbkdf2$1.pbkdf2Async = pbkdf2Async;

    var sha256 = {};

    var _sha2 = {};

    Object.defineProperty(_sha2, "__esModule", { value: true });
    _sha2.SHA2 = void 0;
    const _assert_js_1 = _assert;
    const utils_js_1$2 = utils;
    // Polyfill for Safari 14
    function setBigUint64(view, byteOffset, value, isLE) {
        if (typeof view.setBigUint64 === 'function')
            return view.setBigUint64(byteOffset, value, isLE);
        const _32n = BigInt(32);
        const _u32_max = BigInt(0xffffffff);
        const wh = Number((value >> _32n) & _u32_max);
        const wl = Number(value & _u32_max);
        const h = isLE ? 4 : 0;
        const l = isLE ? 0 : 4;
        view.setUint32(byteOffset + h, wh, isLE);
        view.setUint32(byteOffset + l, wl, isLE);
    }
    // Base SHA2 class (RFC 6234)
    class SHA2 extends utils_js_1$2.Hash {
        constructor(blockLen, outputLen, padOffset, isLE) {
            super();
            this.blockLen = blockLen;
            this.outputLen = outputLen;
            this.padOffset = padOffset;
            this.isLE = isLE;
            this.finished = false;
            this.length = 0;
            this.pos = 0;
            this.destroyed = false;
            this.buffer = new Uint8Array(blockLen);
            this.view = (0, utils_js_1$2.createView)(this.buffer);
        }
        update(data) {
            _assert_js_1.default.exists(this);
            const { view, buffer, blockLen } = this;
            data = (0, utils_js_1$2.toBytes)(data);
            const len = data.length;
            for (let pos = 0; pos < len;) {
                const take = Math.min(blockLen - this.pos, len - pos);
                // Fast path: we have at least one block in input, cast it to view and process
                if (take === blockLen) {
                    const dataView = (0, utils_js_1$2.createView)(data);
                    for (; blockLen <= len - pos; pos += blockLen)
                        this.process(dataView, pos);
                    continue;
                }
                buffer.set(data.subarray(pos, pos + take), this.pos);
                this.pos += take;
                pos += take;
                if (this.pos === blockLen) {
                    this.process(view, 0);
                    this.pos = 0;
                }
            }
            this.length += data.length;
            this.roundClean();
            return this;
        }
        digestInto(out) {
            _assert_js_1.default.exists(this);
            _assert_js_1.default.output(out, this);
            this.finished = true;
            // Padding
            // We can avoid allocation of buffer for padding completely if it
            // was previously not allocated here. But it won't change performance.
            const { buffer, view, blockLen, isLE } = this;
            let { pos } = this;
            // append the bit '1' to the message
            buffer[pos++] = 0b10000000;
            this.buffer.subarray(pos).fill(0);
            // we have less than padOffset left in buffer, so we cannot put length in current block, need process it and pad again
            if (this.padOffset > blockLen - pos) {
                this.process(view, 0);
                pos = 0;
            }
            // Pad until full block byte with zeros
            for (let i = pos; i < blockLen; i++)
                buffer[i] = 0;
            // Note: sha512 requires length to be 128bit integer, but length in JS will overflow before that
            // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
            // So we just write lowest 64 bits of that value.
            setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
            this.process(view, 0);
            const oview = (0, utils_js_1$2.createView)(out);
            const len = this.outputLen;
            // NOTE: we do division by 4 later, which should be fused in single op with modulo by JIT
            if (len % 4)
                throw new Error('_sha2: outputLen should be aligned to 32bit');
            const outLen = len / 4;
            const state = this.get();
            if (outLen > state.length)
                throw new Error('_sha2: outputLen bigger than state');
            for (let i = 0; i < outLen; i++)
                oview.setUint32(4 * i, state[i], isLE);
        }
        digest() {
            const { buffer, outputLen } = this;
            this.digestInto(buffer);
            const res = buffer.slice(0, outputLen);
            this.destroy();
            return res;
        }
        _cloneInto(to) {
            to || (to = new this.constructor());
            to.set(...this.get());
            const { blockLen, buffer, length, finished, destroyed, pos } = this;
            to.length = length;
            to.pos = pos;
            to.finished = finished;
            to.destroyed = destroyed;
            if (length % blockLen)
                to.buffer.set(buffer);
            return to;
        }
    }
    _sha2.SHA2 = SHA2;

    Object.defineProperty(sha256, "__esModule", { value: true });
    sha256.sha224 = sha256.sha256 = void 0;
    const _sha2_js_1$1 = _sha2;
    const utils_js_1$1 = utils;
    // Choice: a ? b : c
    const Chi = (a, b, c) => (a & b) ^ (~a & c);
    // Majority function, true if any two inpust is true
    const Maj = (a, b, c) => (a & b) ^ (a & c) ^ (b & c);
    // Round constants:
    // first 32 bits of the fractional parts of the cube roots of the first 64 primes 2..311)
    // prettier-ignore
    const SHA256_K = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    // Initial state (first 32 bits of the fractional parts of the square roots of the first 8 primes 2..19):
    // prettier-ignore
    const IV = new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    // Temporary buffer, not used to store anything between runs
    // Named this way because it matches specification.
    const SHA256_W = new Uint32Array(64);
    class SHA256 extends _sha2_js_1$1.SHA2 {
        constructor() {
            super(64, 32, 8, false);
            // We cannot use array here since array allows indexing by variable
            // which means optimizer/compiler cannot use registers.
            this.A = IV[0] | 0;
            this.B = IV[1] | 0;
            this.C = IV[2] | 0;
            this.D = IV[3] | 0;
            this.E = IV[4] | 0;
            this.F = IV[5] | 0;
            this.G = IV[6] | 0;
            this.H = IV[7] | 0;
        }
        get() {
            const { A, B, C, D, E, F, G, H } = this;
            return [A, B, C, D, E, F, G, H];
        }
        // prettier-ignore
        set(A, B, C, D, E, F, G, H) {
            this.A = A | 0;
            this.B = B | 0;
            this.C = C | 0;
            this.D = D | 0;
            this.E = E | 0;
            this.F = F | 0;
            this.G = G | 0;
            this.H = H | 0;
        }
        process(view, offset) {
            // Extend the first 16 words into the remaining 48 words w[16..63] of the message schedule array
            for (let i = 0; i < 16; i++, offset += 4)
                SHA256_W[i] = view.getUint32(offset, false);
            for (let i = 16; i < 64; i++) {
                const W15 = SHA256_W[i - 15];
                const W2 = SHA256_W[i - 2];
                const s0 = (0, utils_js_1$1.rotr)(W15, 7) ^ (0, utils_js_1$1.rotr)(W15, 18) ^ (W15 >>> 3);
                const s1 = (0, utils_js_1$1.rotr)(W2, 17) ^ (0, utils_js_1$1.rotr)(W2, 19) ^ (W2 >>> 10);
                SHA256_W[i] = (s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16]) | 0;
            }
            // Compression function main loop, 64 rounds
            let { A, B, C, D, E, F, G, H } = this;
            for (let i = 0; i < 64; i++) {
                const sigma1 = (0, utils_js_1$1.rotr)(E, 6) ^ (0, utils_js_1$1.rotr)(E, 11) ^ (0, utils_js_1$1.rotr)(E, 25);
                const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
                const sigma0 = (0, utils_js_1$1.rotr)(A, 2) ^ (0, utils_js_1$1.rotr)(A, 13) ^ (0, utils_js_1$1.rotr)(A, 22);
                const T2 = (sigma0 + Maj(A, B, C)) | 0;
                H = G;
                G = F;
                F = E;
                E = (D + T1) | 0;
                D = C;
                C = B;
                B = A;
                A = (T1 + T2) | 0;
            }
            // Add the compressed chunk to the current hash value
            A = (A + this.A) | 0;
            B = (B + this.B) | 0;
            C = (C + this.C) | 0;
            D = (D + this.D) | 0;
            E = (E + this.E) | 0;
            F = (F + this.F) | 0;
            G = (G + this.G) | 0;
            H = (H + this.H) | 0;
            this.set(A, B, C, D, E, F, G, H);
        }
        roundClean() {
            SHA256_W.fill(0);
        }
        destroy() {
            this.set(0, 0, 0, 0, 0, 0, 0, 0);
            this.buffer.fill(0);
        }
    }
    // Constants from https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
    class SHA224 extends SHA256 {
        constructor() {
            super();
            this.A = 0xc1059ed8 | 0;
            this.B = 0x367cd507 | 0;
            this.C = 0x3070dd17 | 0;
            this.D = 0xf70e5939 | 0;
            this.E = 0xffc00b31 | 0;
            this.F = 0x68581511 | 0;
            this.G = 0x64f98fa7 | 0;
            this.H = 0xbefa4fa4 | 0;
            this.outputLen = 28;
        }
    }
    /**
     * SHA2-256 hash function
     * @param message - data that would be hashed
     */
    sha256.sha256 = (0, utils_js_1$1.wrapConstructor)(() => new SHA256());
    sha256.sha224 = (0, utils_js_1$1.wrapConstructor)(() => new SHA224());

    var sha512$1 = {};

    var _u64 = {};

    (function (exports) {
    	Object.defineProperty(exports, "__esModule", { value: true });
    	exports.add = exports.toBig = exports.split = exports.fromBig = void 0;
    	const U32_MASK64 = BigInt(2 ** 32 - 1);
    	const _32n = BigInt(32);
    	// We are not using BigUint64Array, because they are extremely slow as per 2022
    	function fromBig(n, le = false) {
    	    if (le)
    	        return { h: Number(n & U32_MASK64), l: Number((n >> _32n) & U32_MASK64) };
    	    return { h: Number((n >> _32n) & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
    	}
    	exports.fromBig = fromBig;
    	function split(lst, le = false) {
    	    let Ah = new Uint32Array(lst.length);
    	    let Al = new Uint32Array(lst.length);
    	    for (let i = 0; i < lst.length; i++) {
    	        const { h, l } = fromBig(lst[i], le);
    	        [Ah[i], Al[i]] = [h, l];
    	    }
    	    return [Ah, Al];
    	}
    	exports.split = split;
    	const toBig = (h, l) => (BigInt(h >>> 0) << _32n) | BigInt(l >>> 0);
    	exports.toBig = toBig;
    	// for Shift in [0, 32)
    	const shrSH = (h, l, s) => h >>> s;
    	const shrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
    	// Right rotate for Shift in [1, 32)
    	const rotrSH = (h, l, s) => (h >>> s) | (l << (32 - s));
    	const rotrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
    	// Right rotate for Shift in (32, 64), NOTE: 32 is special case.
    	const rotrBH = (h, l, s) => (h << (64 - s)) | (l >>> (s - 32));
    	const rotrBL = (h, l, s) => (h >>> (s - 32)) | (l << (64 - s));
    	// Right rotate for shift===32 (just swaps l&h)
    	const rotr32H = (h, l) => l;
    	const rotr32L = (h, l) => h;
    	// Left rotate for Shift in [1, 32)
    	const rotlSH = (h, l, s) => (h << s) | (l >>> (32 - s));
    	const rotlSL = (h, l, s) => (l << s) | (h >>> (32 - s));
    	// Left rotate for Shift in (32, 64), NOTE: 32 is special case.
    	const rotlBH = (h, l, s) => (l << (s - 32)) | (h >>> (64 - s));
    	const rotlBL = (h, l, s) => (h << (s - 32)) | (l >>> (64 - s));
    	// JS uses 32-bit signed integers for bitwise operations which means we cannot
    	// simple take carry out of low bit sum by shift, we need to use division.
    	// Removing "export" has 5% perf penalty -_-
    	function add(Ah, Al, Bh, Bl) {
    	    const l = (Al >>> 0) + (Bl >>> 0);
    	    return { h: (Ah + Bh + ((l / 2 ** 32) | 0)) | 0, l: l | 0 };
    	}
    	exports.add = add;
    	// Addition with more than 2 elements
    	const add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
    	const add3H = (low, Ah, Bh, Ch) => (Ah + Bh + Ch + ((low / 2 ** 32) | 0)) | 0;
    	const add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
    	const add4H = (low, Ah, Bh, Ch, Dh) => (Ah + Bh + Ch + Dh + ((low / 2 ** 32) | 0)) | 0;
    	const add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
    	const add5H = (low, Ah, Bh, Ch, Dh, Eh) => (Ah + Bh + Ch + Dh + Eh + ((low / 2 ** 32) | 0)) | 0;
    	// prettier-ignore
    	const u64 = {
    	    fromBig, split, toBig: exports.toBig,
    	    shrSH, shrSL,
    	    rotrSH, rotrSL, rotrBH, rotrBL,
    	    rotr32H, rotr32L,
    	    rotlSH, rotlSL, rotlBH, rotlBL,
    	    add, add3L, add3H, add4L, add4H, add5H, add5L,
    	};
    	exports.default = u64;
    	
    } (_u64));

    Object.defineProperty(sha512$1, "__esModule", { value: true });
    sha512$1.sha384 = sha512$1.sha512_256 = sha512$1.sha512_224 = sha512$1.sha512 = sha512$1.SHA512 = void 0;
    const _sha2_js_1 = _sha2;
    const _u64_js_1 = _u64;
    const utils_js_1 = utils;
    // Round contants (first 32 bits of the fractional parts of the cube roots of the first 80 primes 2..409):
    // prettier-ignore
    const [SHA512_Kh$1, SHA512_Kl$1] = _u64_js_1.default.split([
        '0x428a2f98d728ae22', '0x7137449123ef65cd', '0xb5c0fbcfec4d3b2f', '0xe9b5dba58189dbbc',
        '0x3956c25bf348b538', '0x59f111f1b605d019', '0x923f82a4af194f9b', '0xab1c5ed5da6d8118',
        '0xd807aa98a3030242', '0x12835b0145706fbe', '0x243185be4ee4b28c', '0x550c7dc3d5ffb4e2',
        '0x72be5d74f27b896f', '0x80deb1fe3b1696b1', '0x9bdc06a725c71235', '0xc19bf174cf692694',
        '0xe49b69c19ef14ad2', '0xefbe4786384f25e3', '0x0fc19dc68b8cd5b5', '0x240ca1cc77ac9c65',
        '0x2de92c6f592b0275', '0x4a7484aa6ea6e483', '0x5cb0a9dcbd41fbd4', '0x76f988da831153b5',
        '0x983e5152ee66dfab', '0xa831c66d2db43210', '0xb00327c898fb213f', '0xbf597fc7beef0ee4',
        '0xc6e00bf33da88fc2', '0xd5a79147930aa725', '0x06ca6351e003826f', '0x142929670a0e6e70',
        '0x27b70a8546d22ffc', '0x2e1b21385c26c926', '0x4d2c6dfc5ac42aed', '0x53380d139d95b3df',
        '0x650a73548baf63de', '0x766a0abb3c77b2a8', '0x81c2c92e47edaee6', '0x92722c851482353b',
        '0xa2bfe8a14cf10364', '0xa81a664bbc423001', '0xc24b8b70d0f89791', '0xc76c51a30654be30',
        '0xd192e819d6ef5218', '0xd69906245565a910', '0xf40e35855771202a', '0x106aa07032bbd1b8',
        '0x19a4c116b8d2d0c8', '0x1e376c085141ab53', '0x2748774cdf8eeb99', '0x34b0bcb5e19b48a8',
        '0x391c0cb3c5c95a63', '0x4ed8aa4ae3418acb', '0x5b9cca4f7763e373', '0x682e6ff3d6b2b8a3',
        '0x748f82ee5defb2fc', '0x78a5636f43172f60', '0x84c87814a1f0ab72', '0x8cc702081a6439ec',
        '0x90befffa23631e28', '0xa4506cebde82bde9', '0xbef9a3f7b2c67915', '0xc67178f2e372532b',
        '0xca273eceea26619c', '0xd186b8c721c0c207', '0xeada7dd6cde0eb1e', '0xf57d4f7fee6ed178',
        '0x06f067aa72176fba', '0x0a637dc5a2c898a6', '0x113f9804bef90dae', '0x1b710b35131c471b',
        '0x28db77f523047d84', '0x32caab7b40c72493', '0x3c9ebe0a15c9bebc', '0x431d67c49c100d4c',
        '0x4cc5d4becb3e42b6', '0x597f299cfc657e2a', '0x5fcb6fab3ad6faec', '0x6c44198c4a475817'
    ].map(n => BigInt(n)));
    // Temporary buffer, not used to store anything between runs
    const SHA512_W_H$1 = new Uint32Array(80);
    const SHA512_W_L$1 = new Uint32Array(80);
    let SHA512$1 = class SHA512 extends _sha2_js_1.SHA2 {
        constructor() {
            super(128, 64, 16, false);
            // We cannot use array here since array allows indexing by variable which means optimizer/compiler cannot use registers.
            // Also looks cleaner and easier to verify with spec.
            // Initial state (first 32 bits of the fractional parts of the square roots of the first 8 primes 2..19):
            // h -- high 32 bits, l -- low 32 bits
            this.Ah = 0x6a09e667 | 0;
            this.Al = 0xf3bcc908 | 0;
            this.Bh = 0xbb67ae85 | 0;
            this.Bl = 0x84caa73b | 0;
            this.Ch = 0x3c6ef372 | 0;
            this.Cl = 0xfe94f82b | 0;
            this.Dh = 0xa54ff53a | 0;
            this.Dl = 0x5f1d36f1 | 0;
            this.Eh = 0x510e527f | 0;
            this.El = 0xade682d1 | 0;
            this.Fh = 0x9b05688c | 0;
            this.Fl = 0x2b3e6c1f | 0;
            this.Gh = 0x1f83d9ab | 0;
            this.Gl = 0xfb41bd6b | 0;
            this.Hh = 0x5be0cd19 | 0;
            this.Hl = 0x137e2179 | 0;
        }
        // prettier-ignore
        get() {
            const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
            return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
        }
        // prettier-ignore
        set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
            this.Ah = Ah | 0;
            this.Al = Al | 0;
            this.Bh = Bh | 0;
            this.Bl = Bl | 0;
            this.Ch = Ch | 0;
            this.Cl = Cl | 0;
            this.Dh = Dh | 0;
            this.Dl = Dl | 0;
            this.Eh = Eh | 0;
            this.El = El | 0;
            this.Fh = Fh | 0;
            this.Fl = Fl | 0;
            this.Gh = Gh | 0;
            this.Gl = Gl | 0;
            this.Hh = Hh | 0;
            this.Hl = Hl | 0;
        }
        process(view, offset) {
            // Extend the first 16 words into the remaining 64 words w[16..79] of the message schedule array
            for (let i = 0; i < 16; i++, offset += 4) {
                SHA512_W_H$1[i] = view.getUint32(offset);
                SHA512_W_L$1[i] = view.getUint32((offset += 4));
            }
            for (let i = 16; i < 80; i++) {
                // s0 := (w[i-15] rightrotate 1) xor (w[i-15] rightrotate 8) xor (w[i-15] rightshift 7)
                const W15h = SHA512_W_H$1[i - 15] | 0;
                const W15l = SHA512_W_L$1[i - 15] | 0;
                const s0h = _u64_js_1.default.rotrSH(W15h, W15l, 1) ^ _u64_js_1.default.rotrSH(W15h, W15l, 8) ^ _u64_js_1.default.shrSH(W15h, W15l, 7);
                const s0l = _u64_js_1.default.rotrSL(W15h, W15l, 1) ^ _u64_js_1.default.rotrSL(W15h, W15l, 8) ^ _u64_js_1.default.shrSL(W15h, W15l, 7);
                // s1 := (w[i-2] rightrotate 19) xor (w[i-2] rightrotate 61) xor (w[i-2] rightshift 6)
                const W2h = SHA512_W_H$1[i - 2] | 0;
                const W2l = SHA512_W_L$1[i - 2] | 0;
                const s1h = _u64_js_1.default.rotrSH(W2h, W2l, 19) ^ _u64_js_1.default.rotrBH(W2h, W2l, 61) ^ _u64_js_1.default.shrSH(W2h, W2l, 6);
                const s1l = _u64_js_1.default.rotrSL(W2h, W2l, 19) ^ _u64_js_1.default.rotrBL(W2h, W2l, 61) ^ _u64_js_1.default.shrSL(W2h, W2l, 6);
                // SHA256_W[i] = s0 + s1 + SHA256_W[i - 7] + SHA256_W[i - 16];
                const SUMl = _u64_js_1.default.add4L(s0l, s1l, SHA512_W_L$1[i - 7], SHA512_W_L$1[i - 16]);
                const SUMh = _u64_js_1.default.add4H(SUMl, s0h, s1h, SHA512_W_H$1[i - 7], SHA512_W_H$1[i - 16]);
                SHA512_W_H$1[i] = SUMh | 0;
                SHA512_W_L$1[i] = SUMl | 0;
            }
            let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
            // Compression function main loop, 80 rounds
            for (let i = 0; i < 80; i++) {
                // S1 := (e rightrotate 14) xor (e rightrotate 18) xor (e rightrotate 41)
                const sigma1h = _u64_js_1.default.rotrSH(Eh, El, 14) ^ _u64_js_1.default.rotrSH(Eh, El, 18) ^ _u64_js_1.default.rotrBH(Eh, El, 41);
                const sigma1l = _u64_js_1.default.rotrSL(Eh, El, 14) ^ _u64_js_1.default.rotrSL(Eh, El, 18) ^ _u64_js_1.default.rotrBL(Eh, El, 41);
                //const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
                const CHIh = (Eh & Fh) ^ (~Eh & Gh);
                const CHIl = (El & Fl) ^ (~El & Gl);
                // T1 = H + sigma1 + Chi(E, F, G) + SHA512_K[i] + SHA512_W[i]
                // prettier-ignore
                const T1ll = _u64_js_1.default.add5L(Hl, sigma1l, CHIl, SHA512_Kl$1[i], SHA512_W_L$1[i]);
                const T1h = _u64_js_1.default.add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh$1[i], SHA512_W_H$1[i]);
                const T1l = T1ll | 0;
                // S0 := (a rightrotate 28) xor (a rightrotate 34) xor (a rightrotate 39)
                const sigma0h = _u64_js_1.default.rotrSH(Ah, Al, 28) ^ _u64_js_1.default.rotrBH(Ah, Al, 34) ^ _u64_js_1.default.rotrBH(Ah, Al, 39);
                const sigma0l = _u64_js_1.default.rotrSL(Ah, Al, 28) ^ _u64_js_1.default.rotrBL(Ah, Al, 34) ^ _u64_js_1.default.rotrBL(Ah, Al, 39);
                const MAJh = (Ah & Bh) ^ (Ah & Ch) ^ (Bh & Ch);
                const MAJl = (Al & Bl) ^ (Al & Cl) ^ (Bl & Cl);
                Hh = Gh | 0;
                Hl = Gl | 0;
                Gh = Fh | 0;
                Gl = Fl | 0;
                Fh = Eh | 0;
                Fl = El | 0;
                ({ h: Eh, l: El } = _u64_js_1.default.add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
                Dh = Ch | 0;
                Dl = Cl | 0;
                Ch = Bh | 0;
                Cl = Bl | 0;
                Bh = Ah | 0;
                Bl = Al | 0;
                const All = _u64_js_1.default.add3L(T1l, sigma0l, MAJl);
                Ah = _u64_js_1.default.add3H(All, T1h, sigma0h, MAJh);
                Al = All | 0;
            }
            // Add the compressed chunk to the current hash value
            ({ h: Ah, l: Al } = _u64_js_1.default.add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
            ({ h: Bh, l: Bl } = _u64_js_1.default.add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
            ({ h: Ch, l: Cl } = _u64_js_1.default.add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
            ({ h: Dh, l: Dl } = _u64_js_1.default.add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
            ({ h: Eh, l: El } = _u64_js_1.default.add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
            ({ h: Fh, l: Fl } = _u64_js_1.default.add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
            ({ h: Gh, l: Gl } = _u64_js_1.default.add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
            ({ h: Hh, l: Hl } = _u64_js_1.default.add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
            this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
        }
        roundClean() {
            SHA512_W_H$1.fill(0);
            SHA512_W_L$1.fill(0);
        }
        destroy() {
            this.buffer.fill(0);
            this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        }
    };
    sha512$1.SHA512 = SHA512$1;
    let SHA512_224$1 = class SHA512_224 extends SHA512$1 {
        constructor() {
            super();
            // h -- high 32 bits, l -- low 32 bits
            this.Ah = 0x8c3d37c8 | 0;
            this.Al = 0x19544da2 | 0;
            this.Bh = 0x73e19966 | 0;
            this.Bl = 0x89dcd4d6 | 0;
            this.Ch = 0x1dfab7ae | 0;
            this.Cl = 0x32ff9c82 | 0;
            this.Dh = 0x679dd514 | 0;
            this.Dl = 0x582f9fcf | 0;
            this.Eh = 0x0f6d2b69 | 0;
            this.El = 0x7bd44da8 | 0;
            this.Fh = 0x77e36f73 | 0;
            this.Fl = 0x04c48942 | 0;
            this.Gh = 0x3f9d85a8 | 0;
            this.Gl = 0x6a1d36c8 | 0;
            this.Hh = 0x1112e6ad | 0;
            this.Hl = 0x91d692a1 | 0;
            this.outputLen = 28;
        }
    };
    let SHA512_256$1 = class SHA512_256 extends SHA512$1 {
        constructor() {
            super();
            // h -- high 32 bits, l -- low 32 bits
            this.Ah = 0x22312194 | 0;
            this.Al = 0xfc2bf72c | 0;
            this.Bh = 0x9f555fa3 | 0;
            this.Bl = 0xc84c64c2 | 0;
            this.Ch = 0x2393b86b | 0;
            this.Cl = 0x6f53b151 | 0;
            this.Dh = 0x96387719 | 0;
            this.Dl = 0x5940eabd | 0;
            this.Eh = 0x96283ee2 | 0;
            this.El = 0xa88effe3 | 0;
            this.Fh = 0xbe5e1e25 | 0;
            this.Fl = 0x53863992 | 0;
            this.Gh = 0x2b0199fc | 0;
            this.Gl = 0x2c85b8aa | 0;
            this.Hh = 0x0eb72ddc | 0;
            this.Hl = 0x81c52ca2 | 0;
            this.outputLen = 32;
        }
    };
    let SHA384$1 = class SHA384 extends SHA512$1 {
        constructor() {
            super();
            // h -- high 32 bits, l -- low 32 bits
            this.Ah = 0xcbbb9d5d | 0;
            this.Al = 0xc1059ed8 | 0;
            this.Bh = 0x629a292a | 0;
            this.Bl = 0x367cd507 | 0;
            this.Ch = 0x9159015a | 0;
            this.Cl = 0x3070dd17 | 0;
            this.Dh = 0x152fecd8 | 0;
            this.Dl = 0xf70e5939 | 0;
            this.Eh = 0x67332667 | 0;
            this.El = 0xffc00b31 | 0;
            this.Fh = 0x8eb44a87 | 0;
            this.Fl = 0x68581511 | 0;
            this.Gh = 0xdb0c2e0d | 0;
            this.Gl = 0x64f98fa7 | 0;
            this.Hh = 0x47b5481d | 0;
            this.Hl = 0xbefa4fa4 | 0;
            this.outputLen = 48;
        }
    };
    sha512$1.sha512 = (0, utils_js_1.wrapConstructor)(() => new SHA512$1());
    sha512$1.sha512_224 = (0, utils_js_1.wrapConstructor)(() => new SHA512_224$1());
    sha512$1.sha512_256 = (0, utils_js_1.wrapConstructor)(() => new SHA512_256$1());
    sha512$1.sha384 = (0, utils_js_1.wrapConstructor)(() => new SHA384$1());

    var lib = {};

    (function (exports) {
    	/*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    	Object.defineProperty(exports, "__esModule", { value: true });
    	exports.bytes = exports.stringToBytes = exports.str = exports.bytesToString = exports.hex = exports.utf8 = exports.bech32m = exports.bech32 = exports.base58check = exports.base58xmr = exports.base58xrp = exports.base58flickr = exports.base58 = exports.base64url = exports.base64 = exports.base32crockford = exports.base32hex = exports.base32 = exports.base16 = exports.utils = exports.assertNumber = void 0;
    	function assertNumber(n) {
    	    if (!Number.isSafeInteger(n))
    	        throw new Error(`Wrong integer: ${n}`);
    	}
    	exports.assertNumber = assertNumber;
    	function chain(...args) {
    	    const wrap = (a, b) => (c) => a(b(c));
    	    const encode = Array.from(args)
    	        .reverse()
    	        .reduce((acc, i) => (acc ? wrap(acc, i.encode) : i.encode), undefined);
    	    const decode = args.reduce((acc, i) => (acc ? wrap(acc, i.decode) : i.decode), undefined);
    	    return { encode, decode };
    	}
    	function alphabet(alphabet) {
    	    return {
    	        encode: (digits) => {
    	            if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number'))
    	                throw new Error('alphabet.encode input should be an array of numbers');
    	            return digits.map((i) => {
    	                assertNumber(i);
    	                if (i < 0 || i >= alphabet.length)
    	                    throw new Error(`Digit index outside alphabet: ${i} (alphabet: ${alphabet.length})`);
    	                return alphabet[i];
    	            });
    	        },
    	        decode: (input) => {
    	            if (!Array.isArray(input) || (input.length && typeof input[0] !== 'string'))
    	                throw new Error('alphabet.decode input should be array of strings');
    	            return input.map((letter) => {
    	                if (typeof letter !== 'string')
    	                    throw new Error(`alphabet.decode: not string element=${letter}`);
    	                const index = alphabet.indexOf(letter);
    	                if (index === -1)
    	                    throw new Error(`Unknown letter: "${letter}". Allowed: ${alphabet}`);
    	                return index;
    	            });
    	        },
    	    };
    	}
    	function join(separator = '') {
    	    if (typeof separator !== 'string')
    	        throw new Error('join separator should be string');
    	    return {
    	        encode: (from) => {
    	            if (!Array.isArray(from) || (from.length && typeof from[0] !== 'string'))
    	                throw new Error('join.encode input should be array of strings');
    	            for (let i of from)
    	                if (typeof i !== 'string')
    	                    throw new Error(`join.encode: non-string input=${i}`);
    	            return from.join(separator);
    	        },
    	        decode: (to) => {
    	            if (typeof to !== 'string')
    	                throw new Error('join.decode input should be string');
    	            return to.split(separator);
    	        },
    	    };
    	}
    	function padding(bits, chr = '=') {
    	    assertNumber(bits);
    	    if (typeof chr !== 'string')
    	        throw new Error('padding chr should be string');
    	    return {
    	        encode(data) {
    	            if (!Array.isArray(data) || (data.length && typeof data[0] !== 'string'))
    	                throw new Error('padding.encode input should be array of strings');
    	            for (let i of data)
    	                if (typeof i !== 'string')
    	                    throw new Error(`padding.encode: non-string input=${i}`);
    	            while ((data.length * bits) % 8)
    	                data.push(chr);
    	            return data;
    	        },
    	        decode(input) {
    	            if (!Array.isArray(input) || (input.length && typeof input[0] !== 'string'))
    	                throw new Error('padding.encode input should be array of strings');
    	            for (let i of input)
    	                if (typeof i !== 'string')
    	                    throw new Error(`padding.decode: non-string input=${i}`);
    	            let end = input.length;
    	            if ((end * bits) % 8)
    	                throw new Error('Invalid padding: string should have whole number of bytes');
    	            for (; end > 0 && input[end - 1] === chr; end--) {
    	                if (!(((end - 1) * bits) % 8))
    	                    throw new Error('Invalid padding: string has too much padding');
    	            }
    	            return input.slice(0, end);
    	        },
    	    };
    	}
    	function normalize(fn) {
    	    if (typeof fn !== 'function')
    	        throw new Error('normalize fn should be function');
    	    return { encode: (from) => from, decode: (to) => fn(to) };
    	}
    	function convertRadix(data, from, to) {
    	    if (from < 2)
    	        throw new Error(`convertRadix: wrong from=${from}, base cannot be less than 2`);
    	    if (to < 2)
    	        throw new Error(`convertRadix: wrong to=${to}, base cannot be less than 2`);
    	    if (!Array.isArray(data))
    	        throw new Error('convertRadix: data should be array');
    	    if (!data.length)
    	        return [];
    	    let pos = 0;
    	    const res = [];
    	    const digits = Array.from(data);
    	    digits.forEach((d) => {
    	        assertNumber(d);
    	        if (d < 0 || d >= from)
    	            throw new Error(`Wrong integer: ${d}`);
    	    });
    	    while (true) {
    	        let carry = 0;
    	        let done = true;
    	        for (let i = pos; i < digits.length; i++) {
    	            const digit = digits[i];
    	            const digitBase = from * carry + digit;
    	            if (!Number.isSafeInteger(digitBase) ||
    	                (from * carry) / from !== carry ||
    	                digitBase - digit !== from * carry) {
    	                throw new Error('convertRadix: carry overflow');
    	            }
    	            carry = digitBase % to;
    	            digits[i] = Math.floor(digitBase / to);
    	            if (!Number.isSafeInteger(digits[i]) || digits[i] * to + carry !== digitBase)
    	                throw new Error('convertRadix: carry overflow');
    	            if (!done)
    	                continue;
    	            else if (!digits[i])
    	                pos = i;
    	            else
    	                done = false;
    	        }
    	        res.push(carry);
    	        if (done)
    	            break;
    	    }
    	    for (let i = 0; i < data.length - 1 && data[i] === 0; i++)
    	        res.push(0);
    	    return res.reverse();
    	}
    	const gcd = (a, b) => (!b ? a : gcd(b, a % b));
    	const radix2carry = (from, to) => from + (to - gcd(from, to));
    	function convertRadix2(data, from, to, padding) {
    	    if (!Array.isArray(data))
    	        throw new Error('convertRadix2: data should be array');
    	    if (from <= 0 || from > 32)
    	        throw new Error(`convertRadix2: wrong from=${from}`);
    	    if (to <= 0 || to > 32)
    	        throw new Error(`convertRadix2: wrong to=${to}`);
    	    if (radix2carry(from, to) > 32) {
    	        throw new Error(`convertRadix2: carry overflow from=${from} to=${to} carryBits=${radix2carry(from, to)}`);
    	    }
    	    let carry = 0;
    	    let pos = 0;
    	    const mask = 2 ** to - 1;
    	    const res = [];
    	    for (const n of data) {
    	        assertNumber(n);
    	        if (n >= 2 ** from)
    	            throw new Error(`convertRadix2: invalid data word=${n} from=${from}`);
    	        carry = (carry << from) | n;
    	        if (pos + from > 32)
    	            throw new Error(`convertRadix2: carry overflow pos=${pos} from=${from}`);
    	        pos += from;
    	        for (; pos >= to; pos -= to)
    	            res.push(((carry >> (pos - to)) & mask) >>> 0);
    	        carry &= 2 ** pos - 1;
    	    }
    	    carry = (carry << (to - pos)) & mask;
    	    if (!padding && pos >= from)
    	        throw new Error('Excess padding');
    	    if (!padding && carry)
    	        throw new Error(`Non-zero padding: ${carry}`);
    	    if (padding && pos > 0)
    	        res.push(carry >>> 0);
    	    return res;
    	}
    	function radix(num) {
    	    assertNumber(num);
    	    return {
    	        encode: (bytes) => {
    	            if (!(bytes instanceof Uint8Array))
    	                throw new Error('radix.encode input should be Uint8Array');
    	            return convertRadix(Array.from(bytes), 2 ** 8, num);
    	        },
    	        decode: (digits) => {
    	            if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number'))
    	                throw new Error('radix.decode input should be array of strings');
    	            return Uint8Array.from(convertRadix(digits, num, 2 ** 8));
    	        },
    	    };
    	}
    	function radix2(bits, revPadding = false) {
    	    assertNumber(bits);
    	    if (bits <= 0 || bits > 32)
    	        throw new Error('radix2: bits should be in (0..32]');
    	    if (radix2carry(8, bits) > 32 || radix2carry(bits, 8) > 32)
    	        throw new Error('radix2: carry overflow');
    	    return {
    	        encode: (bytes) => {
    	            if (!(bytes instanceof Uint8Array))
    	                throw new Error('radix2.encode input should be Uint8Array');
    	            return convertRadix2(Array.from(bytes), 8, bits, !revPadding);
    	        },
    	        decode: (digits) => {
    	            if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number'))
    	                throw new Error('radix2.decode input should be array of strings');
    	            return Uint8Array.from(convertRadix2(digits, bits, 8, revPadding));
    	        },
    	    };
    	}
    	function unsafeWrapper(fn) {
    	    if (typeof fn !== 'function')
    	        throw new Error('unsafeWrapper fn should be function');
    	    return function (...args) {
    	        try {
    	            return fn.apply(null, args);
    	        }
    	        catch (e) { }
    	    };
    	}
    	function checksum(len, fn) {
    	    assertNumber(len);
    	    if (typeof fn !== 'function')
    	        throw new Error('checksum fn should be function');
    	    return {
    	        encode(data) {
    	            if (!(data instanceof Uint8Array))
    	                throw new Error('checksum.encode: input should be Uint8Array');
    	            const checksum = fn(data).slice(0, len);
    	            const res = new Uint8Array(data.length + len);
    	            res.set(data);
    	            res.set(checksum, data.length);
    	            return res;
    	        },
    	        decode(data) {
    	            if (!(data instanceof Uint8Array))
    	                throw new Error('checksum.decode: input should be Uint8Array');
    	            const payload = data.slice(0, -len);
    	            const newChecksum = fn(payload).slice(0, len);
    	            const oldChecksum = data.slice(-len);
    	            for (let i = 0; i < len; i++)
    	                if (newChecksum[i] !== oldChecksum[i])
    	                    throw new Error('Invalid checksum');
    	            return payload;
    	        },
    	    };
    	}
    	exports.utils = { alphabet, chain, checksum, radix, radix2, join, padding };
    	exports.base16 = chain(radix2(4), alphabet('0123456789ABCDEF'), join(''));
    	exports.base32 = chain(radix2(5), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'), padding(5), join(''));
    	exports.base32hex = chain(radix2(5), alphabet('0123456789ABCDEFGHIJKLMNOPQRSTUV'), padding(5), join(''));
    	exports.base32crockford = chain(radix2(5), alphabet('0123456789ABCDEFGHJKMNPQRSTVWXYZ'), join(''), normalize((s) => s.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1')));
    	exports.base64 = chain(radix2(6), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'), padding(6), join(''));
    	exports.base64url = chain(radix2(6), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'), padding(6), join(''));
    	const genBase58 = (abc) => chain(radix(58), alphabet(abc), join(''));
    	exports.base58 = genBase58('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz');
    	exports.base58flickr = genBase58('123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ');
    	exports.base58xrp = genBase58('rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz');
    	const XMR_BLOCK_LEN = [0, 2, 3, 5, 6, 7, 9, 10, 11];
    	exports.base58xmr = {
    	    encode(data) {
    	        let res = '';
    	        for (let i = 0; i < data.length; i += 8) {
    	            const block = data.subarray(i, i + 8);
    	            res += exports.base58.encode(block).padStart(XMR_BLOCK_LEN[block.length], '1');
    	        }
    	        return res;
    	    },
    	    decode(str) {
    	        let res = [];
    	        for (let i = 0; i < str.length; i += 11) {
    	            const slice = str.slice(i, i + 11);
    	            const blockLen = XMR_BLOCK_LEN.indexOf(slice.length);
    	            const block = exports.base58.decode(slice);
    	            for (let j = 0; j < block.length - blockLen; j++) {
    	                if (block[j] !== 0)
    	                    throw new Error('base58xmr: wrong padding');
    	            }
    	            res = res.concat(Array.from(block.slice(block.length - blockLen)));
    	        }
    	        return Uint8Array.from(res);
    	    },
    	};
    	const base58check = (sha256) => chain(checksum(4, (data) => sha256(sha256(data))), exports.base58);
    	exports.base58check = base58check;
    	const BECH_ALPHABET = chain(alphabet('qpzry9x8gf2tvdw0s3jn54khce6mua7l'), join(''));
    	const POLYMOD_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    	function bech32Polymod(pre) {
    	    const b = pre >> 25;
    	    let chk = (pre & 0x1ffffff) << 5;
    	    for (let i = 0; i < POLYMOD_GENERATORS.length; i++) {
    	        if (((b >> i) & 1) === 1)
    	            chk ^= POLYMOD_GENERATORS[i];
    	    }
    	    return chk;
    	}
    	function bechChecksum(prefix, words, encodingConst = 1) {
    	    const len = prefix.length;
    	    let chk = 1;
    	    for (let i = 0; i < len; i++) {
    	        const c = prefix.charCodeAt(i);
    	        if (c < 33 || c > 126)
    	            throw new Error(`Invalid prefix (${prefix})`);
    	        chk = bech32Polymod(chk) ^ (c >> 5);
    	    }
    	    chk = bech32Polymod(chk);
    	    for (let i = 0; i < len; i++)
    	        chk = bech32Polymod(chk) ^ (prefix.charCodeAt(i) & 0x1f);
    	    for (let v of words)
    	        chk = bech32Polymod(chk) ^ v;
    	    for (let i = 0; i < 6; i++)
    	        chk = bech32Polymod(chk);
    	    chk ^= encodingConst;
    	    return BECH_ALPHABET.encode(convertRadix2([chk % 2 ** 30], 30, 5, false));
    	}
    	function genBech32(encoding) {
    	    const ENCODING_CONST = encoding === 'bech32' ? 1 : 0x2bc830a3;
    	    const _words = radix2(5);
    	    const fromWords = _words.decode;
    	    const toWords = _words.encode;
    	    const fromWordsUnsafe = unsafeWrapper(fromWords);
    	    function encode(prefix, words, limit = 90) {
    	        if (typeof prefix !== 'string')
    	            throw new Error(`bech32.encode prefix should be string, not ${typeof prefix}`);
    	        if (!Array.isArray(words) || (words.length && typeof words[0] !== 'number'))
    	            throw new Error(`bech32.encode words should be array of numbers, not ${typeof words}`);
    	        const actualLength = prefix.length + 7 + words.length;
    	        if (limit !== false && actualLength > limit)
    	            throw new TypeError(`Length ${actualLength} exceeds limit ${limit}`);
    	        prefix = prefix.toLowerCase();
    	        return `${prefix}1${BECH_ALPHABET.encode(words)}${bechChecksum(prefix, words, ENCODING_CONST)}`;
    	    }
    	    function decode(str, limit = 90) {
    	        if (typeof str !== 'string')
    	            throw new Error(`bech32.decode input should be string, not ${typeof str}`);
    	        if (str.length < 8 || (limit !== false && str.length > limit))
    	            throw new TypeError(`Wrong string length: ${str.length} (${str}). Expected (8..${limit})`);
    	        const lowered = str.toLowerCase();
    	        if (str !== lowered && str !== str.toUpperCase())
    	            throw new Error(`String must be lowercase or uppercase`);
    	        str = lowered;
    	        const sepIndex = str.lastIndexOf('1');
    	        if (sepIndex === 0 || sepIndex === -1)
    	            throw new Error(`Letter "1" must be present between prefix and data only`);
    	        const prefix = str.slice(0, sepIndex);
    	        const _words = str.slice(sepIndex + 1);
    	        if (_words.length < 6)
    	            throw new Error('Data must be at least 6 characters long');
    	        const words = BECH_ALPHABET.decode(_words).slice(0, -6);
    	        const sum = bechChecksum(prefix, words, ENCODING_CONST);
    	        if (!_words.endsWith(sum))
    	            throw new Error(`Invalid checksum in ${str}: expected "${sum}"`);
    	        return { prefix, words };
    	    }
    	    const decodeUnsafe = unsafeWrapper(decode);
    	    function decodeToBytes(str) {
    	        const { prefix, words } = decode(str, false);
    	        return { prefix, words, bytes: fromWords(words) };
    	    }
    	    return { encode, decode, decodeToBytes, decodeUnsafe, fromWords, fromWordsUnsafe, toWords };
    	}
    	exports.bech32 = genBech32('bech32');
    	exports.bech32m = genBech32('bech32m');
    	exports.utf8 = {
    	    encode: (data) => new TextDecoder().decode(data),
    	    decode: (str) => new TextEncoder().encode(str),
    	};
    	exports.hex = chain(radix2(4), alphabet('0123456789abcdef'), join(''), normalize((s) => {
    	    if (typeof s !== 'string' || s.length % 2)
    	        throw new TypeError(`hex.decode: expected string, got ${typeof s} with length ${s.length}`);
    	    return s.toLowerCase();
    	}));
    	const CODERS = {
    	    utf8: exports.utf8, hex: exports.hex, base16: exports.base16, base32: exports.base32, base64: exports.base64, base64url: exports.base64url, base58: exports.base58, base58xmr: exports.base58xmr
    	};
    	const coderTypeError = `Invalid encoding type. Available types: ${Object.keys(CODERS).join(', ')}`;
    	const bytesToString = (type, bytes) => {
    	    if (typeof type !== 'string' || !CODERS.hasOwnProperty(type))
    	        throw new TypeError(coderTypeError);
    	    if (!(bytes instanceof Uint8Array))
    	        throw new TypeError('bytesToString() expects Uint8Array');
    	    return CODERS[type].encode(bytes);
    	};
    	exports.bytesToString = bytesToString;
    	exports.str = exports.bytesToString;
    	const stringToBytes = (type, str) => {
    	    if (!CODERS.hasOwnProperty(type))
    	        throw new TypeError(coderTypeError);
    	    if (typeof str !== 'string')
    	        throw new TypeError('stringToBytes() expects string');
    	    return CODERS[type].decode(str);
    	};
    	exports.stringToBytes = stringToBytes;
    	exports.bytes = exports.stringToBytes;
    } (lib));

    Object.defineProperty(bip39, "__esModule", { value: true });
    var mnemonicToSeedSync_1 = bip39.mnemonicToSeedSync = bip39.mnemonicToSeed = validateMnemonic_1 = bip39.validateMnemonic = bip39.entropyToMnemonic = bip39.mnemonicToEntropy = generateMnemonic_1 = bip39.generateMnemonic = void 0;
    /*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
    const _assert_1 = _assert;
    const pbkdf2_1 = pbkdf2$1;
    const sha256_1 = sha256;
    const sha512_1 = sha512$1;
    const utils_1 = utils;
    const base_1 = lib;
    // Japanese wordlist
    const isJapanese = (wordlist) => wordlist[0] === '\u3042\u3044\u3053\u304f\u3057\u3093';
    // Normalization replaces equivalent sequences of characters
    // so that any two texts that are equivalent will be reduced
    // to the same sequence of code points, called the normal form of the original text.
    function nfkd(str) {
        if (typeof str !== 'string')
            throw new TypeError(`Invalid mnemonic type: ${typeof str}`);
        return str.normalize('NFKD');
    }
    function normalize(str) {
        const norm = nfkd(str);
        const words = norm.split(' ');
        if (![12, 15, 18, 21, 24].includes(words.length))
            throw new Error('Invalid mnemonic');
        return { nfkd: norm, words };
    }
    function assertEntropy(entropy) {
        _assert_1.default.bytes(entropy, 16, 20, 24, 28, 32);
    }
    /**
     * Generate x random words. Uses Cryptographically-Secure Random Number Generator.
     * @param wordlist imported wordlist for specific language
     * @param strength mnemonic strength 128-256 bits
     * @example
     * generateMnemonic(wordlist, 128)
     * // 'legal winner thank year wave sausage worth useful legal winner thank yellow'
     */
    function generateMnemonic(wordlist, strength = 128) {
        _assert_1.default.number(strength);
        if (strength % 32 !== 0 || strength > 256)
            throw new TypeError('Invalid entropy');
        return entropyToMnemonic((0, utils_1.randomBytes)(strength / 8), wordlist);
    }
    var generateMnemonic_1 = bip39.generateMnemonic = generateMnemonic;
    const calcChecksum = (entropy) => {
        // Checksum is ent.length/4 bits long
        const bitsLeft = 8 - entropy.length / 4;
        // Zero rightmost "bitsLeft" bits in byte
        // For example: bitsLeft=4 val=10111101 -> 10110000
        return new Uint8Array([((0, sha256_1.sha256)(entropy)[0] >> bitsLeft) << bitsLeft]);
    };
    function getCoder(wordlist) {
        if (!Array.isArray(wordlist) || wordlist.length !== 2048 || typeof wordlist[0] !== 'string')
            throw new Error('Worlist: expected array of 2048 strings');
        wordlist.forEach((i) => {
            if (typeof i !== 'string')
                throw new Error(`Wordlist: non-string element: ${i}`);
        });
        return base_1.utils.chain(base_1.utils.checksum(1, calcChecksum), base_1.utils.radix2(11, true), base_1.utils.alphabet(wordlist));
    }
    /**
     * Reversible: Converts mnemonic string to raw entropy in form of byte array.
     * @param mnemonic 12-24 words
     * @param wordlist imported wordlist for specific language
     * @example
     * const mnem = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
     * mnemonicToEntropy(mnem, wordlist)
     * // Produces
     * new Uint8Array([
     *   0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f,
     *   0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f
     * ])
     */
    function mnemonicToEntropy(mnemonic, wordlist) {
        const { words } = normalize(mnemonic);
        const entropy = getCoder(wordlist).decode(words);
        assertEntropy(entropy);
        return entropy;
    }
    bip39.mnemonicToEntropy = mnemonicToEntropy;
    /**
     * Reversible: Converts raw entropy in form of byte array to mnemonic string.
     * @param entropy byte array
     * @param wordlist imported wordlist for specific language
     * @returns 12-24 words
     * @example
     * const ent = new Uint8Array([
     *   0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f,
     *   0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f
     * ]);
     * entropyToMnemonic(ent, wordlist);
     * // 'legal winner thank year wave sausage worth useful legal winner thank yellow'
     */
    function entropyToMnemonic(entropy, wordlist) {
        assertEntropy(entropy);
        const words = getCoder(wordlist).encode(entropy);
        return words.join(isJapanese(wordlist) ? '\u3000' : ' ');
    }
    bip39.entropyToMnemonic = entropyToMnemonic;
    /**
     * Validates mnemonic for being 12-24 words contained in `wordlist`.
     */
    function validateMnemonic(mnemonic, wordlist) {
        try {
            mnemonicToEntropy(mnemonic, wordlist);
        }
        catch (e) {
            return false;
        }
        return true;
    }
    var validateMnemonic_1 = bip39.validateMnemonic = validateMnemonic;
    const salt = (passphrase) => nfkd(`mnemonic${passphrase}`);
    /**
     * Irreversible: Uses KDF to derive 64 bytes of key data from mnemonic + optional password.
     * @param mnemonic 12-24 words
     * @param passphrase string that will additionally protect the key
     * @returns 64 bytes of key data
     * @example
     * const mnem = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
     * await mnemonicToSeed(mnem, 'password');
     * // new Uint8Array([...64 bytes])
     */
    function mnemonicToSeed(mnemonic, passphrase = '') {
        return (0, pbkdf2_1.pbkdf2Async)(sha512_1.sha512, normalize(mnemonic).nfkd, salt(passphrase), { c: 2048, dkLen: 64 });
    }
    bip39.mnemonicToSeed = mnemonicToSeed;
    /**
     * Irreversible: Uses KDF to derive 64 bytes of key data from mnemonic + optional password.
     * @param mnemonic 12-24 words
     * @param passphrase string that will additionally protect the key
     * @returns 64 bytes of key data
     * @example
     * const mnem = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
     * mnemonicToSeedSync(mnem, 'password');
     * // new Uint8Array([...64 bytes])
     */
    function mnemonicToSeedSync(mnemonic, passphrase = '') {
        return (0, pbkdf2_1.pbkdf2)(sha512_1.sha512, normalize(mnemonic).nfkd, salt(passphrase), { c: 2048, dkLen: 64 });
    }
    mnemonicToSeedSync_1 = bip39.mnemonicToSeedSync = mnemonicToSeedSync;

    // HMAC (RFC 2104)
    class HMAC extends Hash {
        constructor(hash, _key) {
            super();
            this.finished = false;
            this.destroyed = false;
            assert$2.hash(hash);
            const key = toBytes(_key);
            this.iHash = hash.create();
            if (typeof this.iHash.update !== 'function')
                throw new TypeError('Expected instance of class which extends utils.Hash');
            this.blockLen = this.iHash.blockLen;
            this.outputLen = this.iHash.outputLen;
            const blockLen = this.blockLen;
            const pad = new Uint8Array(blockLen);
            // blockLen can be bigger than outputLen
            pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
            for (let i = 0; i < pad.length; i++)
                pad[i] ^= 0x36;
            this.iHash.update(pad);
            // By doing update (processing of first block) of outer hash here we can re-use it between multiple calls via clone
            this.oHash = hash.create();
            // Undo internal XOR && apply outer XOR
            for (let i = 0; i < pad.length; i++)
                pad[i] ^= 0x36 ^ 0x5c;
            this.oHash.update(pad);
            pad.fill(0);
        }
        update(buf) {
            assert$2.exists(this);
            this.iHash.update(buf);
            return this;
        }
        digestInto(out) {
            assert$2.exists(this);
            assert$2.bytes(out, this.outputLen);
            this.finished = true;
            this.iHash.digestInto(out);
            this.oHash.update(out);
            this.oHash.digestInto(out);
            this.destroy();
        }
        digest() {
            const out = new Uint8Array(this.oHash.outputLen);
            this.digestInto(out);
            return out;
        }
        _cloneInto(to) {
            // Create new instance without calling constructor since key already in state and we don't know it.
            to || (to = Object.create(Object.getPrototypeOf(this), {}));
            const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
            to = to;
            to.finished = finished;
            to.destroyed = destroyed;
            to.blockLen = blockLen;
            to.outputLen = outputLen;
            to.oHash = oHash._cloneInto(to.oHash);
            to.iHash = iHash._cloneInto(to.iHash);
            return to;
        }
        destroy() {
            this.destroyed = true;
            this.oHash.destroy();
            this.iHash.destroy();
        }
    }
    /**
     * HMAC: RFC2104 message authentication code.
     * @param hash - function that would be used e.g. sha256
     * @param key - message key
     * @param message - message data
     */
    const hmac = (hash, key, message) => new HMAC(hash, key).update(message).digest();
    hmac.create = (hash, key) => new HMAC(hash, key);

    // https://homes.esat.kuleuven.be/~bosselae/ripemd160.html
    // https://homes.esat.kuleuven.be/~bosselae/ripemd160/pdf/AB-9601/AB-9601.pdf
    const Rho = new Uint8Array([7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8]);
    const Id = Uint8Array.from({ length: 16 }, (_, i) => i);
    const Pi = Id.map((i) => (9 * i + 5) % 16);
    let idxL = [Id];
    let idxR = [Pi];
    for (let i = 0; i < 4; i++)
        for (let j of [idxL, idxR])
            j.push(j[i].map((k) => Rho[k]));
    const shifts = [
        [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
        [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
        [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
        [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
        [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5],
    ].map((i) => new Uint8Array(i));
    const shiftsL = idxL.map((idx, i) => idx.map((j) => shifts[i][j]));
    const shiftsR = idxR.map((idx, i) => idx.map((j) => shifts[i][j]));
    const Kl = new Uint32Array([0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e]);
    const Kr = new Uint32Array([0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000]);
    // The rotate left (circular left shift) operation for uint32
    const rotl = (word, shift) => (word << shift) | (word >>> (32 - shift));
    // It's called f() in spec.
    function f(group, x, y, z) {
        if (group === 0)
            return x ^ y ^ z;
        else if (group === 1)
            return (x & y) | (~x & z);
        else if (group === 2)
            return (x | ~y) ^ z;
        else if (group === 3)
            return (x & z) | (y & ~z);
        else
            return x ^ (y | ~z);
    }
    // Temporary buffer, not used to store anything between runs
    const BUF = new Uint32Array(16);
    class RIPEMD160 extends SHA2$1 {
        constructor() {
            super(64, 20, 8, true);
            this.h0 = 0x67452301 | 0;
            this.h1 = 0xefcdab89 | 0;
            this.h2 = 0x98badcfe | 0;
            this.h3 = 0x10325476 | 0;
            this.h4 = 0xc3d2e1f0 | 0;
        }
        get() {
            const { h0, h1, h2, h3, h4 } = this;
            return [h0, h1, h2, h3, h4];
        }
        set(h0, h1, h2, h3, h4) {
            this.h0 = h0 | 0;
            this.h1 = h1 | 0;
            this.h2 = h2 | 0;
            this.h3 = h3 | 0;
            this.h4 = h4 | 0;
        }
        process(view, offset) {
            for (let i = 0; i < 16; i++, offset += 4)
                BUF[i] = view.getUint32(offset, true);
            // prettier-ignore
            let al = this.h0 | 0, ar = al, bl = this.h1 | 0, br = bl, cl = this.h2 | 0, cr = cl, dl = this.h3 | 0, dr = dl, el = this.h4 | 0, er = el;
            // Instead of iterating 0 to 80, we split it into 5 groups
            // And use the groups in constants, functions, etc. Much simpler
            for (let group = 0; group < 5; group++) {
                const rGroup = 4 - group;
                const hbl = Kl[group], hbr = Kr[group]; // prettier-ignore
                const rl = idxL[group], rr = idxR[group]; // prettier-ignore
                const sl = shiftsL[group], sr = shiftsR[group]; // prettier-ignore
                for (let i = 0; i < 16; i++) {
                    const tl = (rotl(al + f(group, bl, cl, dl) + BUF[rl[i]] + hbl, sl[i]) + el) | 0;
                    al = el, el = dl, dl = rotl(cl, 10) | 0, cl = bl, bl = tl; // prettier-ignore
                }
                // 2 loops are 10% faster
                for (let i = 0; i < 16; i++) {
                    const tr = (rotl(ar + f(rGroup, br, cr, dr) + BUF[rr[i]] + hbr, sr[i]) + er) | 0;
                    ar = er, er = dr, dr = rotl(cr, 10) | 0, cr = br, br = tr; // prettier-ignore
                }
            }
            // Add the compressed chunk to the current hash value
            this.set((this.h1 + cl + dr) | 0, (this.h2 + dl + er) | 0, (this.h3 + el + ar) | 0, (this.h4 + al + br) | 0, (this.h0 + bl + cr) | 0);
        }
        roundClean() {
            BUF.fill(0);
        }
        destroy() {
            this.destroyed = true;
            this.buffer.fill(0);
            this.set(0, 0, 0, 0, 0);
        }
    }
    /**
     * RIPEMD-160 - a hash function from 1990s.
     * @param message - msg that would be hashed
     */
    const ripemd160 = wrapConstructor(() => new RIPEMD160());

    const U32_MASK64 = BigInt(2 ** 32 - 1);
    const _32n = BigInt(32);
    // We are not using BigUint64Array, because they are extremely slow as per 2022
    function fromBig(n, le = false) {
        if (le)
            return { h: Number(n & U32_MASK64), l: Number((n >> _32n) & U32_MASK64) };
        return { h: Number((n >> _32n) & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
    }
    function split(lst, le = false) {
        let Ah = new Uint32Array(lst.length);
        let Al = new Uint32Array(lst.length);
        for (let i = 0; i < lst.length; i++) {
            const { h, l } = fromBig(lst[i], le);
            [Ah[i], Al[i]] = [h, l];
        }
        return [Ah, Al];
    }
    const toBig = (h, l) => (BigInt(h >>> 0) << _32n) | BigInt(l >>> 0);
    // for Shift in [0, 32)
    const shrSH = (h, l, s) => h >>> s;
    const shrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
    // Right rotate for Shift in [1, 32)
    const rotrSH = (h, l, s) => (h >>> s) | (l << (32 - s));
    const rotrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
    // Right rotate for Shift in (32, 64), NOTE: 32 is special case.
    const rotrBH = (h, l, s) => (h << (64 - s)) | (l >>> (s - 32));
    const rotrBL = (h, l, s) => (h >>> (s - 32)) | (l << (64 - s));
    // Right rotate for shift===32 (just swaps l&h)
    const rotr32H = (h, l) => l;
    const rotr32L = (h, l) => h;
    // Left rotate for Shift in [1, 32)
    const rotlSH = (h, l, s) => (h << s) | (l >>> (32 - s));
    const rotlSL = (h, l, s) => (l << s) | (h >>> (32 - s));
    // Left rotate for Shift in (32, 64), NOTE: 32 is special case.
    const rotlBH = (h, l, s) => (l << (s - 32)) | (h >>> (64 - s));
    const rotlBL = (h, l, s) => (h << (s - 32)) | (l >>> (64 - s));
    // JS uses 32-bit signed integers for bitwise operations which means we cannot
    // simple take carry out of low bit sum by shift, we need to use division.
    // Removing "export" has 5% perf penalty -_-
    function add(Ah, Al, Bh, Bl) {
        const l = (Al >>> 0) + (Bl >>> 0);
        return { h: (Ah + Bh + ((l / 2 ** 32) | 0)) | 0, l: l | 0 };
    }
    // Addition with more than 2 elements
    const add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
    const add3H = (low, Ah, Bh, Ch) => (Ah + Bh + Ch + ((low / 2 ** 32) | 0)) | 0;
    const add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
    const add4H = (low, Ah, Bh, Ch, Dh) => (Ah + Bh + Ch + Dh + ((low / 2 ** 32) | 0)) | 0;
    const add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
    const add5H = (low, Ah, Bh, Ch, Dh, Eh) => (Ah + Bh + Ch + Dh + Eh + ((low / 2 ** 32) | 0)) | 0;
    // prettier-ignore
    const u64 = {
        fromBig, split, toBig,
        shrSH, shrSL,
        rotrSH, rotrSL, rotrBH, rotrBL,
        rotr32H, rotr32L,
        rotlSH, rotlSL, rotlBH, rotlBL,
        add, add3L, add3H, add4L, add4H, add5H, add5L,
    };

    // Round contants (first 32 bits of the fractional parts of the cube roots of the first 80 primes 2..409):
    // prettier-ignore
    const [SHA512_Kh, SHA512_Kl] = u64.split([
        '0x428a2f98d728ae22', '0x7137449123ef65cd', '0xb5c0fbcfec4d3b2f', '0xe9b5dba58189dbbc',
        '0x3956c25bf348b538', '0x59f111f1b605d019', '0x923f82a4af194f9b', '0xab1c5ed5da6d8118',
        '0xd807aa98a3030242', '0x12835b0145706fbe', '0x243185be4ee4b28c', '0x550c7dc3d5ffb4e2',
        '0x72be5d74f27b896f', '0x80deb1fe3b1696b1', '0x9bdc06a725c71235', '0xc19bf174cf692694',
        '0xe49b69c19ef14ad2', '0xefbe4786384f25e3', '0x0fc19dc68b8cd5b5', '0x240ca1cc77ac9c65',
        '0x2de92c6f592b0275', '0x4a7484aa6ea6e483', '0x5cb0a9dcbd41fbd4', '0x76f988da831153b5',
        '0x983e5152ee66dfab', '0xa831c66d2db43210', '0xb00327c898fb213f', '0xbf597fc7beef0ee4',
        '0xc6e00bf33da88fc2', '0xd5a79147930aa725', '0x06ca6351e003826f', '0x142929670a0e6e70',
        '0x27b70a8546d22ffc', '0x2e1b21385c26c926', '0x4d2c6dfc5ac42aed', '0x53380d139d95b3df',
        '0x650a73548baf63de', '0x766a0abb3c77b2a8', '0x81c2c92e47edaee6', '0x92722c851482353b',
        '0xa2bfe8a14cf10364', '0xa81a664bbc423001', '0xc24b8b70d0f89791', '0xc76c51a30654be30',
        '0xd192e819d6ef5218', '0xd69906245565a910', '0xf40e35855771202a', '0x106aa07032bbd1b8',
        '0x19a4c116b8d2d0c8', '0x1e376c085141ab53', '0x2748774cdf8eeb99', '0x34b0bcb5e19b48a8',
        '0x391c0cb3c5c95a63', '0x4ed8aa4ae3418acb', '0x5b9cca4f7763e373', '0x682e6ff3d6b2b8a3',
        '0x748f82ee5defb2fc', '0x78a5636f43172f60', '0x84c87814a1f0ab72', '0x8cc702081a6439ec',
        '0x90befffa23631e28', '0xa4506cebde82bde9', '0xbef9a3f7b2c67915', '0xc67178f2e372532b',
        '0xca273eceea26619c', '0xd186b8c721c0c207', '0xeada7dd6cde0eb1e', '0xf57d4f7fee6ed178',
        '0x06f067aa72176fba', '0x0a637dc5a2c898a6', '0x113f9804bef90dae', '0x1b710b35131c471b',
        '0x28db77f523047d84', '0x32caab7b40c72493', '0x3c9ebe0a15c9bebc', '0x431d67c49c100d4c',
        '0x4cc5d4becb3e42b6', '0x597f299cfc657e2a', '0x5fcb6fab3ad6faec', '0x6c44198c4a475817'
    ].map(n => BigInt(n)));
    // Temporary buffer, not used to store anything between runs
    const SHA512_W_H = new Uint32Array(80);
    const SHA512_W_L = new Uint32Array(80);
    class SHA512 extends SHA2$1 {
        constructor() {
            super(128, 64, 16, false);
            // We cannot use array here since array allows indexing by variable which means optimizer/compiler cannot use registers.
            // Also looks cleaner and easier to verify with spec.
            // Initial state (first 32 bits of the fractional parts of the square roots of the first 8 primes 2..19):
            // h -- high 32 bits, l -- low 32 bits
            this.Ah = 0x6a09e667 | 0;
            this.Al = 0xf3bcc908 | 0;
            this.Bh = 0xbb67ae85 | 0;
            this.Bl = 0x84caa73b | 0;
            this.Ch = 0x3c6ef372 | 0;
            this.Cl = 0xfe94f82b | 0;
            this.Dh = 0xa54ff53a | 0;
            this.Dl = 0x5f1d36f1 | 0;
            this.Eh = 0x510e527f | 0;
            this.El = 0xade682d1 | 0;
            this.Fh = 0x9b05688c | 0;
            this.Fl = 0x2b3e6c1f | 0;
            this.Gh = 0x1f83d9ab | 0;
            this.Gl = 0xfb41bd6b | 0;
            this.Hh = 0x5be0cd19 | 0;
            this.Hl = 0x137e2179 | 0;
        }
        // prettier-ignore
        get() {
            const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
            return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
        }
        // prettier-ignore
        set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
            this.Ah = Ah | 0;
            this.Al = Al | 0;
            this.Bh = Bh | 0;
            this.Bl = Bl | 0;
            this.Ch = Ch | 0;
            this.Cl = Cl | 0;
            this.Dh = Dh | 0;
            this.Dl = Dl | 0;
            this.Eh = Eh | 0;
            this.El = El | 0;
            this.Fh = Fh | 0;
            this.Fl = Fl | 0;
            this.Gh = Gh | 0;
            this.Gl = Gl | 0;
            this.Hh = Hh | 0;
            this.Hl = Hl | 0;
        }
        process(view, offset) {
            // Extend the first 16 words into the remaining 64 words w[16..79] of the message schedule array
            for (let i = 0; i < 16; i++, offset += 4) {
                SHA512_W_H[i] = view.getUint32(offset);
                SHA512_W_L[i] = view.getUint32((offset += 4));
            }
            for (let i = 16; i < 80; i++) {
                // s0 := (w[i-15] rightrotate 1) xor (w[i-15] rightrotate 8) xor (w[i-15] rightshift 7)
                const W15h = SHA512_W_H[i - 15] | 0;
                const W15l = SHA512_W_L[i - 15] | 0;
                const s0h = u64.rotrSH(W15h, W15l, 1) ^ u64.rotrSH(W15h, W15l, 8) ^ u64.shrSH(W15h, W15l, 7);
                const s0l = u64.rotrSL(W15h, W15l, 1) ^ u64.rotrSL(W15h, W15l, 8) ^ u64.shrSL(W15h, W15l, 7);
                // s1 := (w[i-2] rightrotate 19) xor (w[i-2] rightrotate 61) xor (w[i-2] rightshift 6)
                const W2h = SHA512_W_H[i - 2] | 0;
                const W2l = SHA512_W_L[i - 2] | 0;
                const s1h = u64.rotrSH(W2h, W2l, 19) ^ u64.rotrBH(W2h, W2l, 61) ^ u64.shrSH(W2h, W2l, 6);
                const s1l = u64.rotrSL(W2h, W2l, 19) ^ u64.rotrBL(W2h, W2l, 61) ^ u64.shrSL(W2h, W2l, 6);
                // SHA256_W[i] = s0 + s1 + SHA256_W[i - 7] + SHA256_W[i - 16];
                const SUMl = u64.add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
                const SUMh = u64.add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
                SHA512_W_H[i] = SUMh | 0;
                SHA512_W_L[i] = SUMl | 0;
            }
            let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
            // Compression function main loop, 80 rounds
            for (let i = 0; i < 80; i++) {
                // S1 := (e rightrotate 14) xor (e rightrotate 18) xor (e rightrotate 41)
                const sigma1h = u64.rotrSH(Eh, El, 14) ^ u64.rotrSH(Eh, El, 18) ^ u64.rotrBH(Eh, El, 41);
                const sigma1l = u64.rotrSL(Eh, El, 14) ^ u64.rotrSL(Eh, El, 18) ^ u64.rotrBL(Eh, El, 41);
                //const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
                const CHIh = (Eh & Fh) ^ (~Eh & Gh);
                const CHIl = (El & Fl) ^ (~El & Gl);
                // T1 = H + sigma1 + Chi(E, F, G) + SHA512_K[i] + SHA512_W[i]
                // prettier-ignore
                const T1ll = u64.add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
                const T1h = u64.add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
                const T1l = T1ll | 0;
                // S0 := (a rightrotate 28) xor (a rightrotate 34) xor (a rightrotate 39)
                const sigma0h = u64.rotrSH(Ah, Al, 28) ^ u64.rotrBH(Ah, Al, 34) ^ u64.rotrBH(Ah, Al, 39);
                const sigma0l = u64.rotrSL(Ah, Al, 28) ^ u64.rotrBL(Ah, Al, 34) ^ u64.rotrBL(Ah, Al, 39);
                const MAJh = (Ah & Bh) ^ (Ah & Ch) ^ (Bh & Ch);
                const MAJl = (Al & Bl) ^ (Al & Cl) ^ (Bl & Cl);
                Hh = Gh | 0;
                Hl = Gl | 0;
                Gh = Fh | 0;
                Gl = Fl | 0;
                Fh = Eh | 0;
                Fl = El | 0;
                ({ h: Eh, l: El } = u64.add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
                Dh = Ch | 0;
                Dl = Cl | 0;
                Ch = Bh | 0;
                Cl = Bl | 0;
                Bh = Ah | 0;
                Bl = Al | 0;
                const All = u64.add3L(T1l, sigma0l, MAJl);
                Ah = u64.add3H(All, T1h, sigma0h, MAJh);
                Al = All | 0;
            }
            // Add the compressed chunk to the current hash value
            ({ h: Ah, l: Al } = u64.add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
            ({ h: Bh, l: Bl } = u64.add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
            ({ h: Ch, l: Cl } = u64.add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
            ({ h: Dh, l: Dl } = u64.add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
            ({ h: Eh, l: El } = u64.add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
            ({ h: Fh, l: Fl } = u64.add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
            ({ h: Gh, l: Gl } = u64.add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
            ({ h: Hh, l: Hl } = u64.add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
            this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
        }
        roundClean() {
            SHA512_W_H.fill(0);
            SHA512_W_L.fill(0);
        }
        destroy() {
            this.buffer.fill(0);
            this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        }
    }
    class SHA512_224 extends SHA512 {
        constructor() {
            super();
            // h -- high 32 bits, l -- low 32 bits
            this.Ah = 0x8c3d37c8 | 0;
            this.Al = 0x19544da2 | 0;
            this.Bh = 0x73e19966 | 0;
            this.Bl = 0x89dcd4d6 | 0;
            this.Ch = 0x1dfab7ae | 0;
            this.Cl = 0x32ff9c82 | 0;
            this.Dh = 0x679dd514 | 0;
            this.Dl = 0x582f9fcf | 0;
            this.Eh = 0x0f6d2b69 | 0;
            this.El = 0x7bd44da8 | 0;
            this.Fh = 0x77e36f73 | 0;
            this.Fl = 0x04c48942 | 0;
            this.Gh = 0x3f9d85a8 | 0;
            this.Gl = 0x6a1d36c8 | 0;
            this.Hh = 0x1112e6ad | 0;
            this.Hl = 0x91d692a1 | 0;
            this.outputLen = 28;
        }
    }
    class SHA512_256 extends SHA512 {
        constructor() {
            super();
            // h -- high 32 bits, l -- low 32 bits
            this.Ah = 0x22312194 | 0;
            this.Al = 0xfc2bf72c | 0;
            this.Bh = 0x9f555fa3 | 0;
            this.Bl = 0xc84c64c2 | 0;
            this.Ch = 0x2393b86b | 0;
            this.Cl = 0x6f53b151 | 0;
            this.Dh = 0x96387719 | 0;
            this.Dl = 0x5940eabd | 0;
            this.Eh = 0x96283ee2 | 0;
            this.El = 0xa88effe3 | 0;
            this.Fh = 0xbe5e1e25 | 0;
            this.Fl = 0x53863992 | 0;
            this.Gh = 0x2b0199fc | 0;
            this.Gl = 0x2c85b8aa | 0;
            this.Hh = 0x0eb72ddc | 0;
            this.Hl = 0x81c52ca2 | 0;
            this.outputLen = 32;
        }
    }
    class SHA384 extends SHA512 {
        constructor() {
            super();
            // h -- high 32 bits, l -- low 32 bits
            this.Ah = 0xcbbb9d5d | 0;
            this.Al = 0xc1059ed8 | 0;
            this.Bh = 0x629a292a | 0;
            this.Bl = 0x367cd507 | 0;
            this.Ch = 0x9159015a | 0;
            this.Cl = 0x3070dd17 | 0;
            this.Dh = 0x152fecd8 | 0;
            this.Dl = 0xf70e5939 | 0;
            this.Eh = 0x67332667 | 0;
            this.El = 0xffc00b31 | 0;
            this.Fh = 0x8eb44a87 | 0;
            this.Fl = 0x68581511 | 0;
            this.Gh = 0xdb0c2e0d | 0;
            this.Gl = 0x64f98fa7 | 0;
            this.Hh = 0x47b5481d | 0;
            this.Hl = 0xbefa4fa4 | 0;
            this.outputLen = 48;
        }
    }
    const sha512 = wrapConstructor(() => new SHA512());
    wrapConstructor(() => new SHA512_224());
    wrapConstructor(() => new SHA512_256());
    wrapConstructor(() => new SHA384());

    utils$1.hmacSha256Sync = (key, ...msgs) => hmac(sha256$1, key, utils$1.concatBytes(...msgs));
    const base58check = base58check$1(sha256$1);
    function bytesToNumber(bytes) {
        return BigInt(`0x${bytesToHex(bytes)}`);
    }
    function numberToBytes(num) {
        return hexToBytes(num.toString(16).padStart(64, '0'));
    }
    const MASTER_SECRET = utf8ToBytes('Bitcoin seed');
    const BITCOIN_VERSIONS = { private: 0x0488ade4, public: 0x0488b21e };
    const HARDENED_OFFSET = 0x80000000;
    const hash160 = (data) => ripemd160(sha256$1(data));
    const fromU32 = (data) => createView(data).getUint32(0, false);
    const toU32 = (n) => {
        if (!Number.isSafeInteger(n) || n < 0 || n > 2 ** 32 - 1) {
            throw new Error(`Invalid number=${n}. Should be from 0 to 2 ** 32 - 1`);
        }
        const buf = new Uint8Array(4);
        createView(buf).setUint32(0, n, false);
        return buf;
    };
    class HDKey {
        constructor(opt) {
            this.depth = 0;
            this.index = 0;
            this.chainCode = null;
            this.parentFingerprint = 0;
            if (!opt || typeof opt !== 'object') {
                throw new Error('HDKey.constructor must not be called directly');
            }
            this.versions = opt.versions || BITCOIN_VERSIONS;
            this.depth = opt.depth || 0;
            this.chainCode = opt.chainCode;
            this.index = opt.index || 0;
            this.parentFingerprint = opt.parentFingerprint || 0;
            if (!this.depth) {
                if (this.parentFingerprint || this.index) {
                    throw new Error('HDKey: zero depth with non-zero index/parent fingerprint');
                }
            }
            if (opt.publicKey && opt.privateKey) {
                throw new Error('HDKey: publicKey and privateKey at same time.');
            }
            if (opt.privateKey) {
                if (!utils$1.isValidPrivateKey(opt.privateKey)) {
                    throw new Error('Invalid private key');
                }
                this.privKey =
                    typeof opt.privateKey === 'bigint' ? opt.privateKey : bytesToNumber(opt.privateKey);
                this.privKeyBytes = numberToBytes(this.privKey);
                this.pubKey = getPublicKey$1(opt.privateKey, true);
            }
            else if (opt.publicKey) {
                this.pubKey = Point.fromHex(opt.publicKey).toRawBytes(true);
            }
            else {
                throw new Error('HDKey: no public or private key provided');
            }
            this.pubHash = hash160(this.pubKey);
        }
        get fingerprint() {
            if (!this.pubHash) {
                throw new Error('No publicKey set!');
            }
            return fromU32(this.pubHash);
        }
        get identifier() {
            return this.pubHash;
        }
        get pubKeyHash() {
            return this.pubHash;
        }
        get privateKey() {
            return this.privKeyBytes || null;
        }
        get publicKey() {
            return this.pubKey || null;
        }
        get privateExtendedKey() {
            const priv = this.privateKey;
            if (!priv) {
                throw new Error('No private key');
            }
            return base58check.encode(this.serialize(this.versions.private, concatBytes(new Uint8Array([0]), priv)));
        }
        get publicExtendedKey() {
            if (!this.pubKey) {
                throw new Error('No public key');
            }
            return base58check.encode(this.serialize(this.versions.public, this.pubKey));
        }
        static fromMasterSeed(seed, versions = BITCOIN_VERSIONS) {
            bytes$1(seed);
            if (8 * seed.length < 128 || 8 * seed.length > 512) {
                throw new Error(`HDKey: wrong seed length=${seed.length}. Should be between 128 and 512 bits; 256 bits is advised)`);
            }
            const I = hmac(sha512, MASTER_SECRET, seed);
            return new HDKey({
                versions,
                chainCode: I.slice(32),
                privateKey: I.slice(0, 32),
            });
        }
        static fromExtendedKey(base58key, versions = BITCOIN_VERSIONS) {
            const keyBuffer = base58check.decode(base58key);
            const keyView = createView(keyBuffer);
            const version = keyView.getUint32(0, false);
            const opt = {
                versions,
                depth: keyBuffer[4],
                parentFingerprint: keyView.getUint32(5, false),
                index: keyView.getUint32(9, false),
                chainCode: keyBuffer.slice(13, 45),
            };
            const key = keyBuffer.slice(45);
            const isPriv = key[0] === 0;
            if (version !== versions[isPriv ? 'private' : 'public']) {
                throw new Error('Version mismatch');
            }
            if (isPriv) {
                return new HDKey({ ...opt, privateKey: key.slice(1) });
            }
            else {
                return new HDKey({ ...opt, publicKey: key });
            }
        }
        static fromJSON(json) {
            return HDKey.fromExtendedKey(json.xpriv);
        }
        derive(path) {
            if (!/^[mM]'?/.test(path)) {
                throw new Error('Path must start with "m" or "M"');
            }
            if (/^[mM]'?$/.test(path)) {
                return this;
            }
            const parts = path.replace(/^[mM]'?\//, '').split('/');
            let child = this;
            for (const c of parts) {
                const m = /^(\d+)('?)$/.exec(c);
                if (!m || m.length !== 3) {
                    throw new Error(`Invalid child index: ${c}`);
                }
                let idx = +m[1];
                if (!Number.isSafeInteger(idx) || idx >= HARDENED_OFFSET) {
                    throw new Error('Invalid index');
                }
                if (m[2] === "'") {
                    idx += HARDENED_OFFSET;
                }
                child = child.deriveChild(idx);
            }
            return child;
        }
        deriveChild(index) {
            if (!this.pubKey || !this.chainCode) {
                throw new Error('No publicKey or chainCode set');
            }
            let data = toU32(index);
            if (index >= HARDENED_OFFSET) {
                const priv = this.privateKey;
                if (!priv) {
                    throw new Error('Could not derive hardened child key');
                }
                data = concatBytes(new Uint8Array([0]), priv, data);
            }
            else {
                data = concatBytes(this.pubKey, data);
            }
            const I = hmac(sha512, this.chainCode, data);
            const childTweak = bytesToNumber(I.slice(0, 32));
            const chainCode = I.slice(32);
            if (!utils$1.isValidPrivateKey(childTweak)) {
                throw new Error('Tweak bigger than curve order');
            }
            const opt = {
                versions: this.versions,
                chainCode,
                depth: this.depth + 1,
                parentFingerprint: this.fingerprint,
                index,
            };
            try {
                if (this.privateKey) {
                    const added = utils$1.mod(this.privKey + childTweak, CURVE.n);
                    if (!utils$1.isValidPrivateKey(added)) {
                        throw new Error('The tweak was out of range or the resulted private key is invalid');
                    }
                    opt.privateKey = added;
                }
                else {
                    const added = Point.fromHex(this.pubKey).add(Point.fromPrivateKey(childTweak));
                    if (added.equals(Point.ZERO)) {
                        throw new Error('The tweak was equal to negative P, which made the result key invalid');
                    }
                    opt.publicKey = added.toRawBytes(true);
                }
                return new HDKey(opt);
            }
            catch (err) {
                return this.deriveChild(index + 1);
            }
        }
        sign(hash) {
            if (!this.privateKey) {
                throw new Error('No privateKey set!');
            }
            bytes$1(hash, 32);
            return signSync(hash, this.privKey, {
                canonical: true,
                der: false,
            });
        }
        verify(hash, signature) {
            bytes$1(hash, 32);
            bytes$1(signature, 64);
            if (!this.publicKey) {
                throw new Error('No publicKey set!');
            }
            let sig;
            try {
                sig = Signature.fromCompact(signature);
            }
            catch (error) {
                return false;
            }
            return verify(sig, hash, this.publicKey);
        }
        wipePrivateData() {
            this.privKey = undefined;
            if (this.privKeyBytes) {
                this.privKeyBytes.fill(0);
                this.privKeyBytes = undefined;
            }
            return this;
        }
        toJSON() {
            return {
                xpriv: this.privateExtendedKey,
                xpub: this.publicExtendedKey,
            };
        }
        serialize(version, key) {
            if (!this.chainCode) {
                throw new Error('No chainCode set');
            }
            bytes$1(key, 33);
            return concatBytes(toU32(version), new Uint8Array([this.depth]), toU32(this.parentFingerprint), toU32(this.index), this.chainCode, key);
        }
    }

    var __defProp = Object.defineProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };
    function generatePrivateKey() {
      return utils$1.bytesToHex(utils$1.randomPrivateKey());
    }
    function getPublicKey(privateKey) {
      return utils$1.bytesToHex(schnorr.getPublicKey(privateKey));
    }

    // utils.ts
    var utils_exports = {};
    __export(utils_exports, {
      insertEventIntoAscendingList: () => insertEventIntoAscendingList,
      insertEventIntoDescendingList: () => insertEventIntoDescendingList,
      normalizeURL: () => normalizeURL,
      utf8Decoder: () => utf8Decoder,
      utf8Encoder: () => utf8Encoder
    });
    var utf8Decoder = new TextDecoder("utf-8");
    var utf8Encoder = new TextEncoder();
    function normalizeURL(url) {
      let p = new URL(url);
      p.pathname = p.pathname.replace(/\/+/g, "/");
      if (p.pathname.endsWith("/"))
        p.pathname = p.pathname.slice(0, -1);
      if (p.port === "80" && p.protocol === "ws:" || p.port === "443" && p.protocol === "wss:")
        p.port = "";
      p.searchParams.sort();
      p.hash = "";
      return p.toString();
    }
    function insertEventIntoDescendingList(sortedArray, event) {
      let start = 0;
      let end = sortedArray.length - 1;
      let midPoint;
      let position = start;
      if (end < 0) {
        position = 0;
      } else if (event.created_at < sortedArray[end].created_at) {
        position = end + 1;
      } else if (event.created_at >= sortedArray[start].created_at) {
        position = start;
      } else
        while (true) {
          if (end <= start + 1) {
            position = end;
            break;
          }
          midPoint = Math.floor(start + (end - start) / 2);
          if (sortedArray[midPoint].created_at > event.created_at) {
            start = midPoint;
          } else if (sortedArray[midPoint].created_at < event.created_at) {
            end = midPoint;
          } else {
            position = midPoint;
            break;
          }
        }
      if (sortedArray[position]?.id !== event.id) {
        return [
          ...sortedArray.slice(0, position),
          event,
          ...sortedArray.slice(position)
        ];
      }
      return sortedArray;
    }
    function insertEventIntoAscendingList(sortedArray, event) {
      let start = 0;
      let end = sortedArray.length - 1;
      let midPoint;
      let position = start;
      if (end < 0) {
        position = 0;
      } else if (event.created_at > sortedArray[end].created_at) {
        position = end + 1;
      } else if (event.created_at <= sortedArray[start].created_at) {
        position = start;
      } else
        while (true) {
          if (end <= start + 1) {
            position = end;
            break;
          }
          midPoint = Math.floor(start + (end - start) / 2);
          if (sortedArray[midPoint].created_at < event.created_at) {
            start = midPoint;
          } else if (sortedArray[midPoint].created_at > event.created_at) {
            end = midPoint;
          } else {
            position = midPoint;
            break;
          }
        }
      if (sortedArray[position]?.id !== event.id) {
        return [
          ...sortedArray.slice(0, position),
          event,
          ...sortedArray.slice(position)
        ];
      }
      return sortedArray;
    }
    function serializeEvent(evt) {
      if (!validateEvent(evt))
        throw new Error("can't serialize event with wrong or missing properties");
      return JSON.stringify([
        0,
        evt.pubkey,
        evt.created_at,
        evt.kind,
        evt.tags,
        evt.content
      ]);
    }
    function getEventHash(event) {
      let eventHash = sha256$1(utf8Encoder.encode(serializeEvent(event)));
      return utils$1.bytesToHex(eventHash);
    }
    function validateEvent(event) {
      if (typeof event !== "object")
        return false;
      if (typeof event.kind !== "number")
        return false;
      if (typeof event.content !== "string")
        return false;
      if (typeof event.created_at !== "number")
        return false;
      if (typeof event.pubkey !== "string")
        return false;
      if (!event.pubkey.match(/^[a-f0-9]{64}$/))
        return false;
      if (!Array.isArray(event.tags))
        return false;
      for (let i = 0; i < event.tags.length; i++) {
        let tag = event.tags[i];
        if (!Array.isArray(tag))
          return false;
        for (let j = 0; j < tag.length; j++) {
          if (typeof tag[j] === "object")
            return false;
        }
      }
      return true;
    }
    function verifySignature(event) {
      return schnorr.verifySync(
        event.sig,
        getEventHash(event),
        event.pubkey
      );
    }
    function signEvent(event, key) {
      return utils$1.bytesToHex(
        schnorr.signSync(getEventHash(event), key)
      );
    }

    // filter.ts
    function matchFilter(filter, event) {
      if (filter.ids && filter.ids.indexOf(event.id) === -1) {
        if (!filter.ids.some((prefix) => event.id.startsWith(prefix))) {
          return false;
        }
      }
      if (filter.kinds && filter.kinds.indexOf(event.kind) === -1)
        return false;
      if (filter.authors && filter.authors.indexOf(event.pubkey) === -1) {
        if (!filter.authors.some((prefix) => event.pubkey.startsWith(prefix))) {
          return false;
        }
      }
      for (let f in filter) {
        if (f[0] === "#") {
          let tagName = f.slice(1);
          let values = filter[`#${tagName}`];
          if (values && !event.tags.find(
            ([t, v]) => t === f.slice(1) && values.indexOf(v) !== -1
          ))
            return false;
        }
      }
      if (filter.since && event.created_at < filter.since)
        return false;
      if (filter.until && event.created_at >= filter.until)
        return false;
      return true;
    }
    function matchFilters(filters, event) {
      for (let i = 0; i < filters.length; i++) {
        if (matchFilter(filters[i], event))
          return true;
      }
      return false;
    }

    // fakejson.ts
    var fakejson_exports = {};
    __export(fakejson_exports, {
      getHex64: () => getHex64,
      getInt: () => getInt,
      getSubscriptionId: () => getSubscriptionId,
      matchEventId: () => matchEventId,
      matchEventKind: () => matchEventKind,
      matchEventPubkey: () => matchEventPubkey
    });
    function getHex64(json, field) {
      let len = field.length + 3;
      let idx = json.indexOf(`"${field}":`) + len;
      let s = json.slice(idx).indexOf(`"`) + idx + 1;
      return json.slice(s, s + 64);
    }
    function getInt(json, field) {
      let len = field.length;
      let idx = json.indexOf(`"${field}":`) + len + 3;
      let sliced = json.slice(idx);
      let end = Math.min(sliced.indexOf(","), sliced.indexOf("}"));
      return parseInt(sliced.slice(0, end), 10);
    }
    function getSubscriptionId(json) {
      let idx = json.slice(0, 22).indexOf(`"EVENT"`);
      if (idx === -1)
        return null;
      let pstart = json.slice(idx + 7 + 1).indexOf(`"`);
      if (pstart === -1)
        return null;
      let start = idx + 7 + 1 + pstart;
      let pend = json.slice(start + 1, 80).indexOf(`"`);
      if (pend === -1)
        return null;
      let end = start + 1 + pend;
      return json.slice(start + 1, end);
    }
    function matchEventId(json, id) {
      return id === getHex64(json, "id");
    }
    function matchEventPubkey(json, pubkey) {
      return pubkey === getHex64(json, "pubkey");
    }
    function matchEventKind(json, kind) {
      return kind === getInt(json, "kind");
    }

    // relay.ts
    function relayInit(url, options = {}) {
      let { listTimeout = 3e3, getTimeout = 3e3 } = options;
      var ws;
      var openSubs = {};
      var listeners = {
        connect: [],
        disconnect: [],
        error: [],
        notice: []
      };
      var subListeners = {};
      var pubListeners = {};
      var connectionPromise;
      async function connectRelay() {
        if (connectionPromise)
          return connectionPromise;
        connectionPromise = new Promise((resolve, reject) => {
          try {
            ws = new WebSocket(url);
          } catch (err) {
            reject(err);
          }
          ws.onopen = () => {
            listeners.connect.forEach((cb) => cb());
            resolve();
          };
          ws.onerror = () => {
            connectionPromise = void 0;
            listeners.error.forEach((cb) => cb());
            reject();
          };
          ws.onclose = async () => {
            connectionPromise = void 0;
            listeners.disconnect.forEach((cb) => cb());
          };
          let incomingMessageQueue = [];
          let handleNextInterval;
          ws.onmessage = (e) => {
            incomingMessageQueue.push(e.data);
            if (!handleNextInterval) {
              handleNextInterval = setInterval(handleNext, 0);
            }
          };
          function handleNext() {
            if (incomingMessageQueue.length === 0) {
              clearInterval(handleNextInterval);
              handleNextInterval = null;
              return;
            }
            var json = incomingMessageQueue.shift();
            if (!json)
              return;
            let subid = getSubscriptionId(json);
            if (subid) {
              let so = openSubs[subid];
              if (so && so.alreadyHaveEvent && so.alreadyHaveEvent(getHex64(json, "id"), url)) {
                return;
              }
            }
            try {
              let data = JSON.parse(json);
              switch (data[0]) {
                case "EVENT":
                  let id = data[1];
                  let event = data[2];
                  if (validateEvent(event) && openSubs[id] && (openSubs[id].skipVerification || verifySignature(event)) && matchFilters(openSubs[id].filters, event)) {
                    openSubs[id];
                    (subListeners[id]?.event || []).forEach((cb) => cb(event));
                  }
                  return;
                case "EOSE": {
                  let id2 = data[1];
                  if (id2 in subListeners) {
                    subListeners[id2].eose.forEach((cb) => cb());
                    subListeners[id2].eose = [];
                  }
                  return;
                }
                case "OK": {
                  let id2 = data[1];
                  let ok = data[2];
                  let reason = data[3] || "";
                  if (id2 in pubListeners) {
                    if (ok)
                      pubListeners[id2].ok.forEach((cb) => cb());
                    else
                      pubListeners[id2].failed.forEach((cb) => cb(reason));
                    pubListeners[id2].ok = [];
                    pubListeners[id2].failed = [];
                  }
                  return;
                }
                case "NOTICE":
                  let notice = data[1];
                  listeners.notice.forEach((cb) => cb(notice));
                  return;
              }
            } catch (err) {
              return;
            }
          }
        });
        return connectionPromise;
      }
      function connected() {
        return ws?.readyState === 1;
      }
      async function connect() {
        if (connected())
          return;
        await connectRelay();
      }
      async function trySend(params) {
        let msg = JSON.stringify(params);
        if (!connected()) {
          await new Promise((resolve) => setTimeout(resolve, 1e3));
          if (!connected()) {
            return;
          }
        }
        try {
          ws.send(msg);
        } catch (err) {
          console.log(err);
        }
      }
      const sub = (filters, {
        skipVerification = false,
        alreadyHaveEvent = null,
        id = Math.random().toString().slice(2)
      } = {}) => {
        let subid = id;
        openSubs[subid] = {
          id: subid,
          filters,
          skipVerification,
          alreadyHaveEvent
        };
        trySend(["REQ", subid, ...filters]);
        return {
          sub: (newFilters, newOpts = {}) => sub(newFilters || filters, {
            skipVerification: newOpts.skipVerification || skipVerification,
            alreadyHaveEvent: newOpts.alreadyHaveEvent || alreadyHaveEvent,
            id: subid
          }),
          unsub: () => {
            delete openSubs[subid];
            delete subListeners[subid];
            trySend(["CLOSE", subid]);
          },
          on: (type, cb) => {
            subListeners[subid] = subListeners[subid] || {
              event: [],
              eose: []
            };
            subListeners[subid][type].push(cb);
          },
          off: (type, cb) => {
            let listeners2 = subListeners[subid];
            let idx = listeners2[type].indexOf(cb);
            if (idx >= 0)
              listeners2[type].splice(idx, 1);
          }
        };
      };
      return {
        url,
        sub,
        on: (type, cb) => {
          listeners[type].push(cb);
          if (type === "connect" && ws?.readyState === 1) {
            cb();
          }
        },
        off: (type, cb) => {
          let index = listeners[type].indexOf(cb);
          if (index !== -1)
            listeners[type].splice(index, 1);
        },
        list: (filters, opts) => new Promise((resolve) => {
          let s = sub(filters, opts);
          let events = [];
          let timeout = setTimeout(() => {
            s.unsub();
            resolve(events);
          }, listTimeout);
          s.on("eose", () => {
            s.unsub();
            clearTimeout(timeout);
            resolve(events);
          });
          s.on("event", (event) => {
            events.push(event);
          });
        }),
        get: (filter, opts) => new Promise((resolve) => {
          let s = sub([filter], opts);
          let timeout = setTimeout(() => {
            s.unsub();
            resolve(null);
          }, getTimeout);
          s.on("event", (event) => {
            s.unsub();
            clearTimeout(timeout);
            resolve(event);
          });
        }),
        publish(event) {
          if (!event.id)
            throw new Error(`event ${event} has no id`);
          let id = event.id;
          trySend(["EVENT", event]);
          return {
            on: (type, cb) => {
              pubListeners[id] = pubListeners[id] || {
                ok: [],
                failed: []
              };
              pubListeners[id][type].push(cb);
            },
            off: (type, cb) => {
              let listeners2 = pubListeners[id];
              if (!listeners2)
                return;
              let idx = listeners2[type].indexOf(cb);
              if (idx >= 0)
                listeners2[type].splice(idx, 1);
            }
          };
        },
        connect,
        close() {
          listeners = { connect: [], disconnect: [], error: [], notice: [] };
          subListeners = {};
          pubListeners = {};
          if (ws.readyState === WebSocket.OPEN) {
            ws?.close();
          }
        },
        get status() {
          return ws?.readyState ?? 3;
        }
      };
    }

    // nip19.ts
    var nip19_exports = {};
    __export(nip19_exports, {
      decode: () => decode,
      naddrEncode: () => naddrEncode,
      neventEncode: () => neventEncode,
      noteEncode: () => noteEncode,
      nprofileEncode: () => nprofileEncode,
      npubEncode: () => npubEncode,
      nsecEncode: () => nsecEncode
    });
    var Bech32MaxSize = 5e3;
    function decode(nip19) {
      let { prefix, words } = bech32.decode(nip19, Bech32MaxSize);
      let data = new Uint8Array(bech32.fromWords(words));
      switch (prefix) {
        case "nprofile": {
          let tlv = parseTLV(data);
          if (!tlv[0]?.[0])
            throw new Error("missing TLV 0 for nprofile");
          if (tlv[0][0].length !== 32)
            throw new Error("TLV 0 should be 32 bytes");
          return {
            type: "nprofile",
            data: {
              pubkey: utils$1.bytesToHex(tlv[0][0]),
              relays: tlv[1] ? tlv[1].map((d) => utf8Decoder.decode(d)) : []
            }
          };
        }
        case "nevent": {
          let tlv = parseTLV(data);
          if (!tlv[0]?.[0])
            throw new Error("missing TLV 0 for nevent");
          if (tlv[0][0].length !== 32)
            throw new Error("TLV 0 should be 32 bytes");
          if (tlv[2] && tlv[2][0].length !== 32)
            throw new Error("TLV 2 should be 32 bytes");
          return {
            type: "nevent",
            data: {
              id: utils$1.bytesToHex(tlv[0][0]),
              relays: tlv[1] ? tlv[1].map((d) => utf8Decoder.decode(d)) : [],
              author: tlv[2]?.[0] ? utils$1.bytesToHex(tlv[2][0]) : void 0
            }
          };
        }
        case "naddr": {
          let tlv = parseTLV(data);
          if (!tlv[0]?.[0])
            throw new Error("missing TLV 0 for naddr");
          if (!tlv[2]?.[0])
            throw new Error("missing TLV 2 for naddr");
          if (tlv[2][0].length !== 32)
            throw new Error("TLV 2 should be 32 bytes");
          if (!tlv[3]?.[0])
            throw new Error("missing TLV 3 for naddr");
          if (tlv[3][0].length !== 4)
            throw new Error("TLV 3 should be 4 bytes");
          return {
            type: "naddr",
            data: {
              identifier: utf8Decoder.decode(tlv[0][0]),
              pubkey: utils$1.bytesToHex(tlv[2][0]),
              kind: parseInt(utils$1.bytesToHex(tlv[3][0]), 16),
              relays: tlv[1] ? tlv[1].map((d) => utf8Decoder.decode(d)) : []
            }
          };
        }
        case "nsec":
        case "npub":
        case "note":
          return { type: prefix, data: utils$1.bytesToHex(data) };
        default:
          throw new Error(`unknown prefix ${prefix}`);
      }
    }
    function parseTLV(data) {
      let result = {};
      let rest = data;
      while (rest.length > 0) {
        let t = rest[0];
        let l = rest[1];
        let v = rest.slice(2, 2 + l);
        rest = rest.slice(2 + l);
        if (v.length < l)
          continue;
        result[t] = result[t] || [];
        result[t].push(v);
      }
      return result;
    }
    function nsecEncode(hex) {
      return encodeBytes("nsec", hex);
    }
    function npubEncode(hex) {
      return encodeBytes("npub", hex);
    }
    function noteEncode(hex) {
      return encodeBytes("note", hex);
    }
    function encodeBytes(prefix, hex) {
      let data = utils$1.hexToBytes(hex);
      let words = bech32.toWords(data);
      return bech32.encode(prefix, words, Bech32MaxSize);
    }
    function nprofileEncode(profile) {
      let data = encodeTLV({
        0: [utils$1.hexToBytes(profile.pubkey)],
        1: (profile.relays || []).map((url) => utf8Encoder.encode(url))
      });
      let words = bech32.toWords(data);
      return bech32.encode("nprofile", words, Bech32MaxSize);
    }
    function neventEncode(event) {
      let data = encodeTLV({
        0: [utils$1.hexToBytes(event.id)],
        1: (event.relays || []).map((url) => utf8Encoder.encode(url)),
        2: event.author ? [utils$1.hexToBytes(event.author)] : []
      });
      let words = bech32.toWords(data);
      return bech32.encode("nevent", words, Bech32MaxSize);
    }
    function naddrEncode(addr) {
      let kind = new ArrayBuffer(4);
      new DataView(kind).setUint32(0, addr.kind, false);
      let data = encodeTLV({
        0: [utf8Encoder.encode(addr.identifier)],
        1: (addr.relays || []).map((url) => utf8Encoder.encode(url)),
        2: [utils$1.hexToBytes(addr.pubkey)],
        3: [new Uint8Array(kind)]
      });
      let words = bech32.toWords(data);
      return bech32.encode("naddr", words, Bech32MaxSize);
    }
    function encodeTLV(tlv) {
      let entries = [];
      Object.entries(tlv).forEach(([t, vs]) => {
        vs.forEach((v) => {
          let entry = new Uint8Array(v.length + 2);
          entry.set([parseInt(t)], 0);
          entry.set([v.length], 1);
          entry.set(v, 2);
          entries.push(entry);
        });
      });
      return utils$1.concatBytes(...entries);
    }

    // nip04.ts
    var nip04_exports = {};
    __export(nip04_exports, {
      decrypt: () => decrypt,
      encrypt: () => encrypt
    });
    async function encrypt(privkey, pubkey, text) {
      const key = getSharedSecret(privkey, "02" + pubkey);
      const normalizedKey = getNormalizedX(key);
      let iv = Uint8Array.from(randomBytes(16));
      let plaintext = utf8Encoder.encode(text);
      let cryptoKey = await crypto.subtle.importKey(
        "raw",
        normalizedKey,
        { name: "AES-CBC" },
        false,
        ["encrypt"]
      );
      let ciphertext = await crypto.subtle.encrypt(
        { name: "AES-CBC", iv },
        cryptoKey,
        plaintext
      );
      let ctb64 = base64.encode(new Uint8Array(ciphertext));
      let ivb64 = base64.encode(new Uint8Array(iv.buffer));
      return `${ctb64}?iv=${ivb64}`;
    }
    async function decrypt(privkey, pubkey, data) {
      let [ctb64, ivb64] = data.split("?iv=");
      let key = getSharedSecret(privkey, "02" + pubkey);
      let normalizedKey = getNormalizedX(key);
      let cryptoKey = await crypto.subtle.importKey(
        "raw",
        normalizedKey,
        { name: "AES-CBC" },
        false,
        ["decrypt"]
      );
      let ciphertext = base64.decode(ctb64);
      let iv = base64.decode(ivb64);
      let plaintext = await crypto.subtle.decrypt(
        { name: "AES-CBC", iv },
        cryptoKey,
        ciphertext
      );
      let text = utf8Decoder.decode(plaintext);
      return text;
    }
    function getNormalizedX(key) {
      return key.slice(1, 33);
    }

    // nip05.ts
    var nip05_exports = {};
    __export(nip05_exports, {
      queryProfile: () => queryProfile,
      searchDomain: () => searchDomain,
      useFetchImplementation: () => useFetchImplementation
    });
    var _fetch;
    try {
      _fetch = fetch;
    } catch {
    }
    function useFetchImplementation(fetchImplementation) {
      _fetch = fetchImplementation;
    }
    async function searchDomain(domain, query = "") {
      try {
        let res = await (await _fetch(`https://${domain}/.well-known/nostr.json?name=${query}`)).json();
        return res.names;
      } catch (_) {
        return {};
      }
    }
    async function queryProfile(fullname) {
      let [name, domain] = fullname.split("@");
      if (!domain) {
        domain = name;
        name = "_";
      }
      if (!name.match(/^[A-Za-z0-9-_]+$/))
        return null;
      if (!domain.includes("."))
        return null;
      let res;
      try {
        res = await (await _fetch(`https://${domain}/.well-known/nostr.json?name=${name}`)).json();
      } catch (err) {
        return null;
      }
      if (!res?.names?.[name])
        return null;
      let pubkey = res.names[name];
      let relays = res.relays?.[pubkey] || [];
      return {
        pubkey,
        relays
      };
    }

    // nip06.ts
    var nip06_exports = {};
    __export(nip06_exports, {
      generateSeedWords: () => generateSeedWords,
      privateKeyFromSeedWords: () => privateKeyFromSeedWords,
      validateWords: () => validateWords
    });
    function privateKeyFromSeedWords(mnemonic, passphrase) {
      let root = HDKey.fromMasterSeed(mnemonicToSeedSync_1(mnemonic, passphrase));
      let privateKey = root.derive(`m/44'/1237'/0'/0/0`).privateKey;
      if (!privateKey)
        throw new Error("could not derive private key");
      return utils$1.bytesToHex(privateKey);
    }
    function generateSeedWords() {
      return generateMnemonic_1(wordlist);
    }
    function validateWords(words) {
      return validateMnemonic_1(words, wordlist);
    }

    // nip10.ts
    var nip10_exports = {};
    __export(nip10_exports, {
      parse: () => parse
    });
    function parse(event) {
      const result = {
        reply: void 0,
        root: void 0,
        mentions: [],
        profiles: []
      };
      const eTags = [];
      for (const tag of event.tags) {
        if (tag[0] === "e" && tag[1]) {
          eTags.push(tag);
        }
        if (tag[0] === "p" && tag[1]) {
          result.profiles.push({
            pubkey: tag[1],
            relays: tag[2] ? [tag[2]] : []
          });
        }
      }
      for (let eTagIndex = 0; eTagIndex < eTags.length; eTagIndex++) {
        const eTag = eTags[eTagIndex];
        const [_, eTagEventId, eTagRelayUrl, eTagMarker] = eTag;
        const eventPointer = {
          id: eTagEventId,
          relays: eTagRelayUrl ? [eTagRelayUrl] : []
        };
        const isFirstETag = eTagIndex === 0;
        const isLastETag = eTagIndex === eTags.length - 1;
        if (eTagMarker === "root") {
          result.root = eventPointer;
          continue;
        }
        if (eTagMarker === "reply") {
          result.reply = eventPointer;
          continue;
        }
        if (eTagMarker === "mention") {
          result.mentions.push(eventPointer);
          continue;
        }
        if (isFirstETag) {
          result.root = eventPointer;
          continue;
        }
        if (isLastETag) {
          result.reply = eventPointer;
          continue;
        }
        result.mentions.push(eventPointer);
      }
      return result;
    }

    // nip26.ts
    var nip26_exports = {};
    __export(nip26_exports, {
      createDelegation: () => createDelegation,
      getDelegator: () => getDelegator
    });
    function createDelegation(privateKey, parameters) {
      let conditions = [];
      if ((parameters.kind || -1) >= 0)
        conditions.push(`kind=${parameters.kind}`);
      if (parameters.until)
        conditions.push(`created_at<${parameters.until}`);
      if (parameters.since)
        conditions.push(`created_at>${parameters.since}`);
      let cond = conditions.join("&");
      if (cond === "")
        throw new Error("refusing to create a delegation without any conditions");
      let sighash = sha256$1(
        utf8Encoder.encode(`nostr:delegation:${parameters.pubkey}:${cond}`)
      );
      let sig = utils$1.bytesToHex(
        schnorr.signSync(sighash, privateKey)
      );
      return {
        from: getPublicKey(privateKey),
        to: parameters.pubkey,
        cond,
        sig
      };
    }
    function getDelegator(event) {
      let tag = event.tags.find((tag2) => tag2[0] === "delegation" && tag2.length >= 4);
      if (!tag)
        return null;
      let pubkey = tag[1];
      let cond = tag[2];
      let sig = tag[3];
      let conditions = cond.split("&");
      for (let i = 0; i < conditions.length; i++) {
        let [key, operator, value] = conditions[i].split(/\b/);
        if (key === "kind" && operator === "=" && event.kind === parseInt(value))
          continue;
        else if (key === "created_at" && operator === "<" && event.created_at < parseInt(value))
          continue;
        else if (key === "created_at" && operator === ">" && event.created_at > parseInt(value))
          continue;
        else
          return null;
      }
      let sighash = sha256$1(
        utf8Encoder.encode(`nostr:delegation:${event.pubkey}:${cond}`)
      );
      if (!schnorr.verifySync(sig, sighash, pubkey))
        return null;
      return pubkey;
    }

    // nip39.ts
    var nip39_exports = {};
    __export(nip39_exports, {
      useFetchImplementation: () => useFetchImplementation2,
      validateGithub: () => validateGithub
    });
    var _fetch2;
    try {
      _fetch2 = fetch;
    } catch {
    }
    function useFetchImplementation2(fetchImplementation) {
      _fetch2 = fetchImplementation;
    }
    async function validateGithub(pubkey, username, proof) {
      try {
        let res = await (await _fetch2(`https://gist.github.com/${username}/${proof}/raw`)).text();
        return res === `Verifying that I control the following Nostr public key: ${pubkey}`;
      } catch (_) {
        return false;
      }
    }

    // nip57.ts
    var nip57_exports = {};
    __export(nip57_exports, {
      getZapEndpoint: () => getZapEndpoint,
      makeZapReceipt: () => makeZapReceipt,
      makeZapRequest: () => makeZapRequest,
      useFetchImplementation: () => useFetchImplementation3,
      validateZapRequest: () => validateZapRequest
    });
    var _fetch3;
    try {
      _fetch3 = fetch;
    } catch {
    }
    function useFetchImplementation3(fetchImplementation) {
      _fetch3 = fetchImplementation;
    }
    async function getZapEndpoint(metadata) {
      try {
        let lnurl = "";
        let { lud06, lud16 } = JSON.parse(metadata.content);
        if (lud06) {
          let { words } = bech32.decode(lud06, 1e3);
          let data = bech32.fromWords(words);
          lnurl = utf8Decoder.decode(data);
        } else if (lud16) {
          let [name, domain] = lud16.split("@");
          lnurl = `https://${domain}/.well-known/lnurlp/${name}`;
        } else {
          return null;
        }
        let res = await _fetch3(lnurl);
        let body = await res.json();
        if (body.allowsNostr && body.nostrPubkey) {
          return body.callback;
        }
      } catch (err) {
      }
      return null;
    }
    function makeZapRequest({
      profile,
      event,
      amount,
      relays,
      comment = ""
    }) {
      if (!amount)
        throw new Error("amount not given");
      if (!profile)
        throw new Error("profile not given");
      let zr = {
        kind: 9734,
        created_at: Math.round(Date.now() / 1e3),
        content: comment,
        tags: [
          ["p", profile],
          ["amount", amount.toString()],
          ["relays", ...relays]
        ]
      };
      if (event) {
        zr.tags.push(["e", event]);
      }
      return zr;
    }
    function validateZapRequest(zapRequestString) {
      let zapRequest;
      try {
        zapRequest = JSON.parse(zapRequestString);
      } catch (err) {
        return "Invalid zap request JSON.";
      }
      if (!validateEvent(zapRequest))
        return "Zap request is not a valid Nostr event.";
      if (!verifySignature(zapRequest))
        return "Invalid signature on zap request.";
      let p = zapRequest.tags.find(([t, v]) => t === "p" && v);
      if (!p)
        return "Zap request doesn't have a 'p' tag.";
      if (!p[1].match(/^[a-f0-9]{64}$/))
        return "Zap request 'p' tag is not valid hex.";
      let e = zapRequest.tags.find(([t, v]) => t === "e" && v);
      if (e && !e[1].match(/^[a-f0-9]{64}$/))
        return "Zap request 'e' tag is not valid hex.";
      let relays = zapRequest.tags.find(([t, v]) => t === "relays" && v);
      if (!relays)
        return "Zap request doesn't have a 'relays' tag.";
      return null;
    }
    function makeZapReceipt({
      zapRequest,
      preimage,
      bolt11,
      paidAt
    }) {
      let zr = JSON.parse(zapRequest);
      let tagsFromZapRequest = zr.tags.filter(
        ([t]) => t === "e" || t === "p" || t === "a"
      );
      let zap = {
        kind: 9735,
        created_at: Math.round(paidAt.getTime() / 1e3),
        content: "",
        tags: [
          ...tagsFromZapRequest,
          ["bolt11", bolt11],
          ["description", zapRequest]
        ]
      };
      if (preimage) {
        zap.tags.push(["preimage", preimage]);
      }
      return zap;
    }
    utils$1.hmacSha256Sync = (key, ...msgs) => hmac(sha256$1, key, utils$1.concatBytes(...msgs));
    utils$1.sha256Sync = (...msgs) => sha256$1(utils$1.concatBytes(...msgs));

    var eventemitter3Exports = {};
    var eventemitter3 = {
      get exports(){ return eventemitter3Exports; },
      set exports(v){ eventemitter3Exports = v; },
    };

    (function (module) {

    	var has = Object.prototype.hasOwnProperty
    	  , prefix = '~';

    	/**
    	 * Constructor to create a storage for our `EE` objects.
    	 * An `Events` instance is a plain object whose properties are event names.
    	 *
    	 * @constructor
    	 * @private
    	 */
    	function Events() {}

    	//
    	// We try to not inherit from `Object.prototype`. In some engines creating an
    	// instance in this way is faster than calling `Object.create(null)` directly.
    	// If `Object.create(null)` is not supported we prefix the event names with a
    	// character to make sure that the built-in object properties are not
    	// overridden or used as an attack vector.
    	//
    	if (Object.create) {
    	  Events.prototype = Object.create(null);

    	  //
    	  // This hack is needed because the `__proto__` property is still inherited in
    	  // some old browsers like Android 4, iPhone 5.1, Opera 11 and Safari 5.
    	  //
    	  if (!new Events().__proto__) prefix = false;
    	}

    	/**
    	 * Representation of a single event listener.
    	 *
    	 * @param {Function} fn The listener function.
    	 * @param {*} context The context to invoke the listener with.
    	 * @param {Boolean} [once=false] Specify if the listener is a one-time listener.
    	 * @constructor
    	 * @private
    	 */
    	function EE(fn, context, once) {
    	  this.fn = fn;
    	  this.context = context;
    	  this.once = once || false;
    	}

    	/**
    	 * Add a listener for a given event.
    	 *
    	 * @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
    	 * @param {(String|Symbol)} event The event name.
    	 * @param {Function} fn The listener function.
    	 * @param {*} context The context to invoke the listener with.
    	 * @param {Boolean} once Specify if the listener is a one-time listener.
    	 * @returns {EventEmitter}
    	 * @private
    	 */
    	function addListener(emitter, event, fn, context, once) {
    	  if (typeof fn !== 'function') {
    	    throw new TypeError('The listener must be a function');
    	  }

    	  var listener = new EE(fn, context || emitter, once)
    	    , evt = prefix ? prefix + event : event;

    	  if (!emitter._events[evt]) emitter._events[evt] = listener, emitter._eventsCount++;
    	  else if (!emitter._events[evt].fn) emitter._events[evt].push(listener);
    	  else emitter._events[evt] = [emitter._events[evt], listener];

    	  return emitter;
    	}

    	/**
    	 * Clear event by name.
    	 *
    	 * @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
    	 * @param {(String|Symbol)} evt The Event name.
    	 * @private
    	 */
    	function clearEvent(emitter, evt) {
    	  if (--emitter._eventsCount === 0) emitter._events = new Events();
    	  else delete emitter._events[evt];
    	}

    	/**
    	 * Minimal `EventEmitter` interface that is molded against the Node.js
    	 * `EventEmitter` interface.
    	 *
    	 * @constructor
    	 * @public
    	 */
    	function EventEmitter() {
    	  this._events = new Events();
    	  this._eventsCount = 0;
    	}

    	/**
    	 * Return an array listing the events for which the emitter has registered
    	 * listeners.
    	 *
    	 * @returns {Array}
    	 * @public
    	 */
    	EventEmitter.prototype.eventNames = function eventNames() {
    	  var names = []
    	    , events
    	    , name;

    	  if (this._eventsCount === 0) return names;

    	  for (name in (events = this._events)) {
    	    if (has.call(events, name)) names.push(prefix ? name.slice(1) : name);
    	  }

    	  if (Object.getOwnPropertySymbols) {
    	    return names.concat(Object.getOwnPropertySymbols(events));
    	  }

    	  return names;
    	};

    	/**
    	 * Return the listeners registered for a given event.
    	 *
    	 * @param {(String|Symbol)} event The event name.
    	 * @returns {Array} The registered listeners.
    	 * @public
    	 */
    	EventEmitter.prototype.listeners = function listeners(event) {
    	  var evt = prefix ? prefix + event : event
    	    , handlers = this._events[evt];

    	  if (!handlers) return [];
    	  if (handlers.fn) return [handlers.fn];

    	  for (var i = 0, l = handlers.length, ee = new Array(l); i < l; i++) {
    	    ee[i] = handlers[i].fn;
    	  }

    	  return ee;
    	};

    	/**
    	 * Return the number of listeners listening to a given event.
    	 *
    	 * @param {(String|Symbol)} event The event name.
    	 * @returns {Number} The number of listeners.
    	 * @public
    	 */
    	EventEmitter.prototype.listenerCount = function listenerCount(event) {
    	  var evt = prefix ? prefix + event : event
    	    , listeners = this._events[evt];

    	  if (!listeners) return 0;
    	  if (listeners.fn) return 1;
    	  return listeners.length;
    	};

    	/**
    	 * Calls each of the listeners registered for a given event.
    	 *
    	 * @param {(String|Symbol)} event The event name.
    	 * @returns {Boolean} `true` if the event had listeners, else `false`.
    	 * @public
    	 */
    	EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
    	  var evt = prefix ? prefix + event : event;

    	  if (!this._events[evt]) return false;

    	  var listeners = this._events[evt]
    	    , len = arguments.length
    	    , args
    	    , i;

    	  if (listeners.fn) {
    	    if (listeners.once) this.removeListener(event, listeners.fn, undefined, true);

    	    switch (len) {
    	      case 1: return listeners.fn.call(listeners.context), true;
    	      case 2: return listeners.fn.call(listeners.context, a1), true;
    	      case 3: return listeners.fn.call(listeners.context, a1, a2), true;
    	      case 4: return listeners.fn.call(listeners.context, a1, a2, a3), true;
    	      case 5: return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
    	      case 6: return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
    	    }

    	    for (i = 1, args = new Array(len -1); i < len; i++) {
    	      args[i - 1] = arguments[i];
    	    }

    	    listeners.fn.apply(listeners.context, args);
    	  } else {
    	    var length = listeners.length
    	      , j;

    	    for (i = 0; i < length; i++) {
    	      if (listeners[i].once) this.removeListener(event, listeners[i].fn, undefined, true);

    	      switch (len) {
    	        case 1: listeners[i].fn.call(listeners[i].context); break;
    	        case 2: listeners[i].fn.call(listeners[i].context, a1); break;
    	        case 3: listeners[i].fn.call(listeners[i].context, a1, a2); break;
    	        case 4: listeners[i].fn.call(listeners[i].context, a1, a2, a3); break;
    	        default:
    	          if (!args) for (j = 1, args = new Array(len -1); j < len; j++) {
    	            args[j - 1] = arguments[j];
    	          }

    	          listeners[i].fn.apply(listeners[i].context, args);
    	      }
    	    }
    	  }

    	  return true;
    	};

    	/**
    	 * Add a listener for a given event.
    	 *
    	 * @param {(String|Symbol)} event The event name.
    	 * @param {Function} fn The listener function.
    	 * @param {*} [context=this] The context to invoke the listener with.
    	 * @returns {EventEmitter} `this`.
    	 * @public
    	 */
    	EventEmitter.prototype.on = function on(event, fn, context) {
    	  return addListener(this, event, fn, context, false);
    	};

    	/**
    	 * Add a one-time listener for a given event.
    	 *
    	 * @param {(String|Symbol)} event The event name.
    	 * @param {Function} fn The listener function.
    	 * @param {*} [context=this] The context to invoke the listener with.
    	 * @returns {EventEmitter} `this`.
    	 * @public
    	 */
    	EventEmitter.prototype.once = function once(event, fn, context) {
    	  return addListener(this, event, fn, context, true);
    	};

    	/**
    	 * Remove the listeners of a given event.
    	 *
    	 * @param {(String|Symbol)} event The event name.
    	 * @param {Function} fn Only remove the listeners that match this function.
    	 * @param {*} context Only remove the listeners that have this context.
    	 * @param {Boolean} once Only remove one-time listeners.
    	 * @returns {EventEmitter} `this`.
    	 * @public
    	 */
    	EventEmitter.prototype.removeListener = function removeListener(event, fn, context, once) {
    	  var evt = prefix ? prefix + event : event;

    	  if (!this._events[evt]) return this;
    	  if (!fn) {
    	    clearEvent(this, evt);
    	    return this;
    	  }

    	  var listeners = this._events[evt];

    	  if (listeners.fn) {
    	    if (
    	      listeners.fn === fn &&
    	      (!once || listeners.once) &&
    	      (!context || listeners.context === context)
    	    ) {
    	      clearEvent(this, evt);
    	    }
    	  } else {
    	    for (var i = 0, events = [], length = listeners.length; i < length; i++) {
    	      if (
    	        listeners[i].fn !== fn ||
    	        (once && !listeners[i].once) ||
    	        (context && listeners[i].context !== context)
    	      ) {
    	        events.push(listeners[i]);
    	      }
    	    }

    	    //
    	    // Reset the array, or remove it completely if we have no more listeners.
    	    //
    	    if (events.length) this._events[evt] = events.length === 1 ? events[0] : events;
    	    else clearEvent(this, evt);
    	  }

    	  return this;
    	};

    	/**
    	 * Remove all listeners, or those of the specified event.
    	 *
    	 * @param {(String|Symbol)} [event] The event name.
    	 * @returns {EventEmitter} `this`.
    	 * @public
    	 */
    	EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
    	  var evt;

    	  if (event) {
    	    evt = prefix ? prefix + event : event;
    	    if (this._events[evt]) clearEvent(this, evt);
    	  } else {
    	    this._events = new Events();
    	    this._eventsCount = 0;
    	  }

    	  return this;
    	};

    	//
    	// Alias methods names because people roll like that.
    	//
    	EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
    	EventEmitter.prototype.addListener = EventEmitter.prototype.on;

    	//
    	// Expose the prefix.
    	//
    	EventEmitter.prefixed = prefix;

    	//
    	// Allow `EventEmitter` to be imported as module namespace.
    	//
    	EventEmitter.EventEmitter = EventEmitter;

    	//
    	// Expose the module.
    	//
    	{
    	  module.exports = EventEmitter;
    	}
    } (eventemitter3));

    var EventEmitter$1 = eventemitter3Exports;

    var node = {};

    Object.defineProperty(node, "__esModule", { value: true });
    node.is_node = void 0;
    //================================================================
    /**
     * @packageDocumentation
     * @module std
     */
    //================================================================
    var is_node_ = null;
    /**
     * Test whether the code is running on NodeJS.
     *
     * @return Whether NodeJS or not.
     */
    function is_node() {
        if (is_node_ === null)
            is_node_ =
                typeof commonjsGlobal === "object" &&
                    typeof commonjsGlobal.process === "object" &&
                    typeof commonjsGlobal.process.versions === "object" &&
                    typeof commonjsGlobal.process.versions.node !== "undefined";
        return is_node_;
    }
    node.is_node = is_node;

    var WebSocket$1 = {};

    var global$2;
    var hasRequiredGlobal$2;

    function requireGlobal$2 () {
    	if (hasRequiredGlobal$2) return global$2;
    	hasRequiredGlobal$2 = 1;
    	var naiveFallback = function () {
    		if (typeof self === "object" && self) return self;
    		if (typeof window === "object" && window) return window;
    		throw new Error("Unable to resolve global `this`");
    	};

    	global$2 = (function () {
    		if (this) return this;

    		// Unexpected strict mode (may happen if e.g. bundled into ESM module)

    		// Fallback to standard globalThis if available
    		if (typeof globalThis === "object" && globalThis) return globalThis;

    		// Thanks @mathiasbynens -> https://mathiasbynens.be/notes/globalthis
    		// In all ES5+ engines global object inherits from Object.prototype
    		// (if you approached one that doesn't please report)
    		try {
    			Object.defineProperty(Object.prototype, "__global__", {
    				get: function () { return this; },
    				configurable: true
    			});
    		} catch (error) {
    			// Unfortunate case of updates to Object.prototype being restricted
    			// via preventExtensions, seal or freeze
    			return naiveFallback();
    		}
    		try {
    			// Safari case (window.__global__ works, but __global__ does not)
    			if (!__global__) return naiveFallback();
    			return __global__;
    		} finally {
    			delete Object.prototype.__global__;
    		}
    	})();
    	return global$2;
    }

    var name = "websocket";
    var description = "Websocket Client & Server Library implementing the WebSocket protocol as specified in RFC 6455.";
    var keywords = [
    	"websocket",
    	"websockets",
    	"socket",
    	"networking",
    	"comet",
    	"push",
    	"RFC-6455",
    	"realtime",
    	"server",
    	"client"
    ];
    var author = "Brian McKelvey <theturtle32@gmail.com> (https://github.com/theturtle32)";
    var contributors = [
    	"Iñaki Baz Castillo <ibc@aliax.net> (http://dev.sipdoc.net)"
    ];
    var version$1 = "1.0.34";
    var repository = {
    	type: "git",
    	url: "https://github.com/theturtle32/WebSocket-Node.git"
    };
    var homepage = "https://github.com/theturtle32/WebSocket-Node";
    var engines = {
    	node: ">=4.0.0"
    };
    var dependencies = {
    	bufferutil: "^4.0.1",
    	debug: "^2.2.0",
    	"es5-ext": "^0.10.50",
    	"typedarray-to-buffer": "^3.1.5",
    	"utf-8-validate": "^5.0.2",
    	yaeti: "^0.0.6"
    };
    var devDependencies = {
    	"buffer-equal": "^1.0.0",
    	gulp: "^4.0.2",
    	"gulp-jshint": "^2.0.4",
    	"jshint-stylish": "^2.2.1",
    	jshint: "^2.0.0",
    	tape: "^4.9.1"
    };
    var config = {
    	verbose: false
    };
    var scripts = {
    	test: "tape test/unit/*.js",
    	gulp: "gulp"
    };
    var main = "index";
    var directories = {
    	lib: "./lib"
    };
    var browser$2 = "lib/browser.js";
    var license = "Apache-2.0";
    var require$$0 = {
    	name: name,
    	description: description,
    	keywords: keywords,
    	author: author,
    	contributors: contributors,
    	version: version$1,
    	repository: repository,
    	homepage: homepage,
    	engines: engines,
    	dependencies: dependencies,
    	devDependencies: devDependencies,
    	config: config,
    	scripts: scripts,
    	main: main,
    	directories: directories,
    	browser: browser$2,
    	license: license
    };

    var version;
    var hasRequiredVersion;

    function requireVersion () {
    	if (hasRequiredVersion) return version;
    	hasRequiredVersion = 1;
    	version = require$$0.version;
    	return version;
    }

    var browser$1;
    var hasRequiredBrowser;

    function requireBrowser () {
    	if (hasRequiredBrowser) return browser$1;
    	hasRequiredBrowser = 1;
    	var _globalThis;
    	if (typeof globalThis === 'object') {
    		_globalThis = globalThis;
    	} else {
    		try {
    			_globalThis = requireGlobal$2();
    		} catch (error) {
    		} finally {
    			if (!_globalThis && typeof window !== 'undefined') { _globalThis = window; }
    			if (!_globalThis) { throw new Error('Could not determine global this'); }
    		}
    	}

    	var NativeWebSocket = _globalThis.WebSocket || _globalThis.MozWebSocket;
    	var websocket_version = requireVersion();


    	/**
    	 * Expose a W3C WebSocket class with just one or two arguments.
    	 */
    	function W3CWebSocket(uri, protocols) {
    		var native_instance;

    		if (protocols) {
    			native_instance = new NativeWebSocket(uri, protocols);
    		}
    		else {
    			native_instance = new NativeWebSocket(uri);
    		}

    		/**
    		 * 'native_instance' is an instance of nativeWebSocket (the browser's WebSocket
    		 * class). Since it is an Object it will be returned as it is when creating an
    		 * instance of W3CWebSocket via 'new W3CWebSocket()'.
    		 *
    		 * ECMAScript 5: http://bclary.com/2004/11/07/#a-13.2.2
    		 */
    		return native_instance;
    	}
    	if (NativeWebSocket) {
    		['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function(prop) {
    			Object.defineProperty(W3CWebSocket, prop, {
    				get: function() { return NativeWebSocket[prop]; }
    			});
    		});
    	}

    	/**
    	 * Module exports.
    	 */
    	browser$1 = {
    	    'w3cwebsocket' : NativeWebSocket ? W3CWebSocket : null,
    	    'version'      : websocket_version
    	};
    	return browser$1;
    }

    var EventTarget = {};

    var HashSet = {};

    var UniqueSet = {};

    var SetContainer = {};

    var Container$1 = {};

    var ForOfAdaptor = {};

    var hasRequiredForOfAdaptor;

    function requireForOfAdaptor () {
    	if (hasRequiredForOfAdaptor) return ForOfAdaptor;
    	hasRequiredForOfAdaptor = 1;
    	Object.defineProperty(ForOfAdaptor, "__esModule", { value: true });
    	ForOfAdaptor.ForOfAdaptor = void 0;
    	/**
    	 * Adaptor for `for ... of` iteration.
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var ForOfAdaptor$1 = /** @class */ (function () {
    	    /**
    	     * Initializer Constructor.
    	     *
    	     * @param first Input iteartor of the first position.
    	     * @param last Input iterator of the last position.
    	     */
    	    function ForOfAdaptor(first, last) {
    	        this.it_ = first;
    	        this.last_ = last;
    	    }
    	    /**
    	     * @inheritDoc
    	     */
    	    ForOfAdaptor.prototype.next = function () {
    	        if (this.it_.equals(this.last_))
    	            return {
    	                done: true,
    	                value: undefined,
    	            };
    	        else {
    	            var it = this.it_;
    	            this.it_ = this.it_.next();
    	            return {
    	                done: false,
    	                value: it.value,
    	            };
    	        }
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    ForOfAdaptor.prototype[Symbol.iterator] = function () {
    	        return this;
    	    };
    	    return ForOfAdaptor;
    	}());
    	ForOfAdaptor.ForOfAdaptor = ForOfAdaptor$1;
    	
    	return ForOfAdaptor;
    }

    var hasRequiredContainer;

    function requireContainer () {
    	if (hasRequiredContainer) return Container$1;
    	hasRequiredContainer = 1;
    	var __values = (commonjsGlobal && commonjsGlobal.__values) || function(o) {
    	    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    	    if (m) return m.call(o);
    	    if (o && typeof o.length === "number") return {
    	        next: function () {
    	            if (o && i >= o.length) o = void 0;
    	            return { value: o && o[i++], done: !o };
    	        }
    	    };
    	    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    	};
    	Object.defineProperty(Container$1, "__esModule", { value: true });
    	Container$1.Container = void 0;
    	var ForOfAdaptor_1 = requireForOfAdaptor();
    	/**
    	 * Basic container.
    	 *
    	 * @template T Stored elements' type
    	 * @template SourceT Derived type extending this {@link Container}
    	 * @template IteratorT Iterator type
    	 * @template ReverseT Reverse iterator type
    	 * @template PElem Parent type of *T*, used for inserting elements through {@link assign} and {@link insert}.
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var Container = /** @class */ (function () {
    	    function Container() {
    	    }
    	    /**
    	     * @inheritDoc
    	     */
    	    Container.prototype.empty = function () {
    	        return this.size() === 0;
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    Container.prototype.rbegin = function () {
    	        return this.end().reverse();
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    Container.prototype.rend = function () {
    	        return this.begin().reverse();
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    Container.prototype[Symbol.iterator] = function () {
    	        return new ForOfAdaptor_1.ForOfAdaptor(this.begin(), this.end());
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    Container.prototype.toJSON = function () {
    	        var e_1, _a;
    	        var ret = [];
    	        try {
    	            for (var _b = __values(this), _c = _b.next(); !_c.done; _c = _b.next()) {
    	                var elem = _c.value;
    	                ret.push(elem);
    	            }
    	        }
    	        catch (e_1_1) { e_1 = { error: e_1_1 }; }
    	        finally {
    	            try {
    	                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
    	            }
    	            finally { if (e_1) throw e_1.error; }
    	        }
    	        return ret;
    	    };
    	    return Container;
    	}());
    	Container$1.Container = Container;
    	
    	return Container$1;
    }

    var NativeArrayIterator = {};

    var hasRequiredNativeArrayIterator;

    function requireNativeArrayIterator () {
    	if (hasRequiredNativeArrayIterator) return NativeArrayIterator;
    	hasRequiredNativeArrayIterator = 1;
    	var __read = (commonjsGlobal && commonjsGlobal.__read) || function (o, n) {
    	    var m = typeof Symbol === "function" && o[Symbol.iterator];
    	    if (!m) return o;
    	    var i = m.call(o), r, ar = [], e;
    	    try {
    	        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    	    }
    	    catch (error) { e = { error: error }; }
    	    finally {
    	        try {
    	            if (r && !r.done && (m = i["return"])) m.call(i);
    	        }
    	        finally { if (e) throw e.error; }
    	    }
    	    return ar;
    	};
    	Object.defineProperty(NativeArrayIterator, "__esModule", { value: true });
    	NativeArrayIterator.NativeArrayIterator = void 0;
    	var NativeArrayIterator$1 = /** @class */ (function () {
    	    /* ---------------------------------------------------------
    	        CONSTRUCTORS
    	    --------------------------------------------------------- */
    	    function NativeArrayIterator(data, index) {
    	        this.data_ = data;
    	        this.index_ = index;
    	    }
    	    /* ---------------------------------------------------------
    	        ACCESSORS
    	    --------------------------------------------------------- */
    	    NativeArrayIterator.prototype.index = function () {
    	        return this.index_;
    	    };
    	    Object.defineProperty(NativeArrayIterator.prototype, "value", {
    	        get: function () {
    	            return this.data_[this.index_];
    	        },
    	        enumerable: false,
    	        configurable: true
    	    });
    	    /* ---------------------------------------------------------
    	        MOVERS
    	    --------------------------------------------------------- */
    	    NativeArrayIterator.prototype.prev = function () {
    	        --this.index_;
    	        return this;
    	    };
    	    NativeArrayIterator.prototype.next = function () {
    	        ++this.index_;
    	        return this;
    	    };
    	    NativeArrayIterator.prototype.advance = function (n) {
    	        this.index_ += n;
    	        return this;
    	    };
    	    /* ---------------------------------------------------------
    	        COMPARES
    	    --------------------------------------------------------- */
    	    NativeArrayIterator.prototype.equals = function (obj) {
    	        return this.data_ === obj.data_ && this.index_ === obj.index_;
    	    };
    	    NativeArrayIterator.prototype.swap = function (obj) {
    	        var _a, _b;
    	        _a = __read([obj.data_, this.data_], 2), this.data_ = _a[0], obj.data_ = _a[1];
    	        _b = __read([obj.index_, this.index_], 2), this.index_ = _b[0], obj.index_ = _b[1];
    	    };
    	    return NativeArrayIterator;
    	}());
    	NativeArrayIterator.NativeArrayIterator = NativeArrayIterator$1;
    	
    	return NativeArrayIterator;
    }

    var hasRequiredSetContainer;

    function requireSetContainer () {
    	if (hasRequiredSetContainer) return SetContainer;
    	hasRequiredSetContainer = 1;
    	var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    	    var extendStatics = function (d, b) {
    	        extendStatics = Object.setPrototypeOf ||
    	            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    	            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    	        return extendStatics(d, b);
    	    };
    	    return function (d, b) {
    	        if (typeof b !== "function" && b !== null)
    	            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    	        extendStatics(d, b);
    	        function __() { this.constructor = d; }
    	        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    	    };
    	})();
    	Object.defineProperty(SetContainer, "__esModule", { value: true });
    	SetContainer.SetContainer = void 0;
    	var Container_1 = requireContainer();
    	var NativeArrayIterator_1 = requireNativeArrayIterator();
    	/**
    	 * Basic set container.
    	 *
    	 * @template Key Key type
    	 * @template Unique Whether duplicated key is blocked or not
    	 * @template Source Derived type extending this {@link SetContainer}
    	 * @template IteratorT Iterator type
    	 * @template ReverseT Reverse iterator type
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var SetContainer$1 = /** @class */ (function (_super) {
    	    __extends(SetContainer, _super);
    	    /* ---------------------------------------------------------
    	        CONSTURCTORS
    	    --------------------------------------------------------- */
    	    /**
    	     * Default Constructor.
    	     */
    	    function SetContainer(factory) {
    	        var _this = _super.call(this) || this;
    	        _this.data_ = factory(_this);
    	        return _this;
    	    }
    	    /**
    	     * @inheritDoc
    	     */
    	    SetContainer.prototype.assign = function (first, last) {
    	        // INSERT
    	        this.clear();
    	        this.insert(first, last);
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    SetContainer.prototype.clear = function () {
    	        // TO BE ABSTRACT
    	        this.data_.clear();
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    SetContainer.prototype.begin = function () {
    	        return this.data_.begin();
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    SetContainer.prototype.end = function () {
    	        return this.data_.end();
    	    };
    	    /* ---------------------------------------------------------
    	        ELEMENTS
    	    --------------------------------------------------------- */
    	    /**
    	     * @inheritDoc
    	     */
    	    SetContainer.prototype.has = function (key) {
    	        return !this.find(key).equals(this.end());
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    SetContainer.prototype.size = function () {
    	        return this.data_.size();
    	    };
    	    /* =========================================================
    	        ELEMENTS I/O
    	            - INSERT
    	            - ERASE
    	            - UTILITY
    	            - POST-PROCESS
    	    ============================================================
    	        INSERT
    	    --------------------------------------------------------- */
    	    /**
    	     * @inheritDoc
    	     */
    	    SetContainer.prototype.push = function () {
    	        var items = [];
    	        for (var _i = 0; _i < arguments.length; _i++) {
    	            items[_i] = arguments[_i];
    	        }
    	        if (items.length === 0)
    	            return this.size();
    	        // INSERT BY RANGE
    	        var first = new NativeArrayIterator_1.NativeArrayIterator(items, 0);
    	        var last = new NativeArrayIterator_1.NativeArrayIterator(items, items.length);
    	        this._Insert_by_range(first, last);
    	        // RETURN SIZE
    	        return this.size();
    	    };
    	    SetContainer.prototype.insert = function () {
    	        var args = [];
    	        for (var _i = 0; _i < arguments.length; _i++) {
    	            args[_i] = arguments[_i];
    	        }
    	        if (args.length === 1)
    	            return this._Insert_by_key(args[0]);
    	        else if (args[0].next instanceof Function &&
    	            args[1].next instanceof Function)
    	            return this._Insert_by_range(args[0], args[1]);
    	        else
    	            return this._Insert_by_hint(args[0], args[1]);
    	    };
    	    SetContainer.prototype.erase = function () {
    	        var args = [];
    	        for (var _i = 0; _i < arguments.length; _i++) {
    	            args[_i] = arguments[_i];
    	        }
    	        if (args.length === 1 &&
    	            !(args[0] instanceof this.end().constructor &&
    	                args[0].source() === this))
    	            return this._Erase_by_val(args[0]);
    	        else if (args.length === 1)
    	            return this._Erase_by_range(args[0]);
    	        else
    	            return this._Erase_by_range(args[0], args[1]);
    	    };
    	    SetContainer.prototype._Erase_by_range = function (first, last) {
    	        if (last === void 0) { last = first.next(); }
    	        // ERASE
    	        var it = this.data_.erase(first, last);
    	        // POST-PROCESS
    	        this._Handle_erase(first, last);
    	        return it;
    	    };
    	    return SetContainer;
    	}(Container_1.Container));
    	SetContainer.SetContainer = SetContainer$1;
    	
    	return SetContainer;
    }

    var ErrorGenerator = {};

    var InvalidArgument = {};

    var LogicError = {};

    var Exception = {};

    var hasRequiredException;

    function requireException () {
    	if (hasRequiredException) return Exception;
    	hasRequiredException = 1;
    	var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    	    var extendStatics = function (d, b) {
    	        extendStatics = Object.setPrototypeOf ||
    	            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    	            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    	        return extendStatics(d, b);
    	    };
    	    return function (d, b) {
    	        if (typeof b !== "function" && b !== null)
    	            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    	        extendStatics(d, b);
    	        function __() { this.constructor = d; }
    	        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    	    };
    	})();
    	Object.defineProperty(Exception, "__esModule", { value: true });
    	Exception.Exception = void 0;
    	//================================================================
    	/**
    	 * @packageDocumentation
    	 * @module std
    	 */
    	//================================================================
    	/**
    	 * Base Exception.
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var Exception$1 = /** @class */ (function (_super) {
    	    __extends(Exception, _super);
    	    /* ---------------------------------------------------------
    	        CONSTRUCTOR
    	    --------------------------------------------------------- */
    	    /**
    	     * Initializer Constructor.
    	     *
    	     * @param message The error messgae.
    	     */
    	    function Exception(message) {
    	        var _newTarget = this.constructor;
    	        var _this = _super.call(this, message) || this;
    	        // INHERITANCE POLYFILL
    	        var proto = _newTarget.prototype;
    	        if (Object.setPrototypeOf)
    	            Object.setPrototypeOf(_this, proto);
    	        else
    	            _this.__proto__ = proto;
    	        return _this;
    	    }
    	    Object.defineProperty(Exception.prototype, "name", {
    	        /* ---------------------------------------------------------
    	            ACCESSORS
    	        --------------------------------------------------------- */
    	        /**
    	         * The error name.
    	         */
    	        get: function () {
    	            return this.constructor.name;
    	        },
    	        enumerable: false,
    	        configurable: true
    	    });
    	    /**
    	     * Get error message.
    	     *
    	     * @return The error message.
    	     */
    	    Exception.prototype.what = function () {
    	        return this.message;
    	    };
    	    /**
    	     * Native function for `JSON.stringify()`.
    	     *
    	     * The {@link Exception.toJSON} function returns only three properties; ({@link name}, {@link message} and {@link stack}). If you want to define a new sub-class extending the {@link Exception} and const the class to export additional props (or remove some props), override this {@link Exception.toJSON} method.
    	     *
    	     * @return An object for `JSON.stringify()`.
    	     */
    	    Exception.prototype.toJSON = function () {
    	        return {
    	            name: this.name,
    	            message: this.message,
    	            stack: this.stack,
    	        };
    	    };
    	    return Exception;
    	}(Error));
    	Exception.Exception = Exception$1;
    	
    	return Exception;
    }

    var hasRequiredLogicError;

    function requireLogicError () {
    	if (hasRequiredLogicError) return LogicError;
    	hasRequiredLogicError = 1;
    	var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    	    var extendStatics = function (d, b) {
    	        extendStatics = Object.setPrototypeOf ||
    	            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    	            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    	        return extendStatics(d, b);
    	    };
    	    return function (d, b) {
    	        if (typeof b !== "function" && b !== null)
    	            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    	        extendStatics(d, b);
    	        function __() { this.constructor = d; }
    	        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    	    };
    	})();
    	Object.defineProperty(LogicError, "__esModule", { value: true });
    	LogicError.LogicError = void 0;
    	//================================================================
    	/**
    	 * @packageDocumentation
    	 * @module std
    	 */
    	//================================================================
    	var Exception_1 = requireException();
    	/**
    	 * Logic Error.
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var LogicError$1 = /** @class */ (function (_super) {
    	    __extends(LogicError, _super);
    	    /**
    	     * Initializer Constructor.
    	     *
    	     * @param message The error messgae.
    	     */
    	    function LogicError(message) {
    	        return _super.call(this, message) || this;
    	    }
    	    return LogicError;
    	}(Exception_1.Exception));
    	LogicError.LogicError = LogicError$1;
    	
    	return LogicError;
    }

    var hasRequiredInvalidArgument;

    function requireInvalidArgument () {
    	if (hasRequiredInvalidArgument) return InvalidArgument;
    	hasRequiredInvalidArgument = 1;
    	var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    	    var extendStatics = function (d, b) {
    	        extendStatics = Object.setPrototypeOf ||
    	            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    	            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    	        return extendStatics(d, b);
    	    };
    	    return function (d, b) {
    	        if (typeof b !== "function" && b !== null)
    	            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    	        extendStatics(d, b);
    	        function __() { this.constructor = d; }
    	        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    	    };
    	})();
    	Object.defineProperty(InvalidArgument, "__esModule", { value: true });
    	InvalidArgument.InvalidArgument = void 0;
    	//================================================================
    	/**
    	 * @packageDocumentation
    	 * @module std
    	 */
    	//================================================================
    	var LogicError_1 = requireLogicError();
    	/**
    	 * Invalid Argument Exception.
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var InvalidArgument$1 = /** @class */ (function (_super) {
    	    __extends(InvalidArgument, _super);
    	    /**
    	     * Initializer Constructor.
    	     *
    	     * @param message The error messgae.
    	     */
    	    function InvalidArgument(message) {
    	        return _super.call(this, message) || this;
    	    }
    	    return InvalidArgument;
    	}(LogicError_1.LogicError));
    	InvalidArgument.InvalidArgument = InvalidArgument$1;
    	
    	return InvalidArgument;
    }

    var OutOfRange = {};

    var hasRequiredOutOfRange;

    function requireOutOfRange () {
    	if (hasRequiredOutOfRange) return OutOfRange;
    	hasRequiredOutOfRange = 1;
    	var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    	    var extendStatics = function (d, b) {
    	        extendStatics = Object.setPrototypeOf ||
    	            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    	            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    	        return extendStatics(d, b);
    	    };
    	    return function (d, b) {
    	        if (typeof b !== "function" && b !== null)
    	            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    	        extendStatics(d, b);
    	        function __() { this.constructor = d; }
    	        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    	    };
    	})();
    	Object.defineProperty(OutOfRange, "__esModule", { value: true });
    	OutOfRange.OutOfRange = void 0;
    	//================================================================
    	/**
    	 * @packageDocumentation
    	 * @module std
    	 */
    	//================================================================
    	var LogicError_1 = requireLogicError();
    	/**
    	 * Out-of-range Exception.
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var OutOfRange$1 = /** @class */ (function (_super) {
    	    __extends(OutOfRange, _super);
    	    /**
    	     * Initializer Constructor.
    	     *
    	     * @param message The error messgae.
    	     */
    	    function OutOfRange(message) {
    	        return _super.call(this, message) || this;
    	    }
    	    return OutOfRange;
    	}(LogicError_1.LogicError));
    	OutOfRange.OutOfRange = OutOfRange$1;
    	
    	return OutOfRange;
    }

    var hasRequiredErrorGenerator;

    function requireErrorGenerator () {
    	if (hasRequiredErrorGenerator) return ErrorGenerator;
    	hasRequiredErrorGenerator = 1;
    	(function (exports) {
    		Object.defineProperty(exports, "__esModule", { value: true });
    		exports.ErrorGenerator = void 0;
    		//================================================================
    		/**
    		 * @packageDocumentation
    		 * @module std.internal
    		 */
    		//================================================================
    		var InvalidArgument_1 = requireInvalidArgument();
    		var OutOfRange_1 = requireOutOfRange();
    		(function (ErrorGenerator) {
    		    /* ---------------------------------------------------------
    		        COMMON
    		    --------------------------------------------------------- */
    		    function get_class_name(instance) {
    		        if (typeof instance === "string")
    		            return instance;
    		        var ret = instance.constructor.name;
    		        if (instance.constructor.__MODULE)
    		            ret = "".concat(instance.constructor.__MODULE, ".").concat(ret);
    		        return "std.".concat(ret);
    		    }
    		    ErrorGenerator.get_class_name = get_class_name;
    		    /* ---------------------------------------------------------
    		        CONTAINERS
    		    --------------------------------------------------------- */
    		    function empty(instance, method) {
    		        return new OutOfRange_1.OutOfRange("Error on ".concat(get_class_name(instance), ".").concat(method, "(): it's empty container."));
    		    }
    		    ErrorGenerator.empty = empty;
    		    function negative_index(instance, method, index) {
    		        return new OutOfRange_1.OutOfRange("Error on ".concat(get_class_name(instance), ".").concat(method, "(): parametric index is negative -> (index = ").concat(index, ")."));
    		    }
    		    ErrorGenerator.negative_index = negative_index;
    		    function excessive_index(instance, method, index, size) {
    		        return new OutOfRange_1.OutOfRange("Error on ".concat(get_class_name(instance), ".").concat(method, "(): parametric index is equal or greater than size -> (index = ").concat(index, ", size: ").concat(size, ")."));
    		    }
    		    ErrorGenerator.excessive_index = excessive_index;
    		    function not_my_iterator(instance, method) {
    		        return new InvalidArgument_1.InvalidArgument("Error on ".concat(get_class_name(instance), ".").concat(method, "(): parametric iterator is not this container's own."));
    		    }
    		    ErrorGenerator.not_my_iterator = not_my_iterator;
    		    function erased_iterator(instance, method) {
    		        return new InvalidArgument_1.InvalidArgument("Error on ".concat(get_class_name(instance), ".").concat(method, "(): parametric iterator, it already has been erased."));
    		    }
    		    ErrorGenerator.erased_iterator = erased_iterator;
    		    function negative_iterator(instance, method, index) {
    		        return new OutOfRange_1.OutOfRange("Error on ".concat(get_class_name(instance), ".").concat(method, "(): parametric iterator is directing negative position -> (index = ").concat(index, ")."));
    		    }
    		    ErrorGenerator.negative_iterator = negative_iterator;
    		    function iterator_end_value(instance, method) {
    		        if (method === void 0) { method = "end"; }
    		        var className = get_class_name(instance);
    		        return new OutOfRange_1.OutOfRange("Error on ".concat(className, ".Iterator.value: cannot access to the ").concat(className, ".").concat(method, "().value."));
    		    }
    		    ErrorGenerator.iterator_end_value = iterator_end_value;
    		    function key_nout_found(instance, method, key) {
    		        throw new OutOfRange_1.OutOfRange("Error on ".concat(get_class_name(instance), ".").concat(method, "(): unable to find the matched key -> ").concat(key));
    		    }
    		    ErrorGenerator.key_nout_found = key_nout_found;
    		})(exports.ErrorGenerator || (exports.ErrorGenerator = {}));
    		
    } (ErrorGenerator));
    	return ErrorGenerator;
    }

    var hasRequiredUniqueSet;

    function requireUniqueSet () {
    	if (hasRequiredUniqueSet) return UniqueSet;
    	hasRequiredUniqueSet = 1;
    	var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    	    var extendStatics = function (d, b) {
    	        extendStatics = Object.setPrototypeOf ||
    	            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    	            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    	        return extendStatics(d, b);
    	    };
    	    return function (d, b) {
    	        if (typeof b !== "function" && b !== null)
    	            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    	        extendStatics(d, b);
    	        function __() { this.constructor = d; }
    	        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    	    };
    	})();
    	var __read = (commonjsGlobal && commonjsGlobal.__read) || function (o, n) {
    	    var m = typeof Symbol === "function" && o[Symbol.iterator];
    	    if (!m) return o;
    	    var i = m.call(o), r, ar = [], e;
    	    try {
    	        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    	    }
    	    catch (error) { e = { error: error }; }
    	    finally {
    	        try {
    	            if (r && !r.done && (m = i["return"])) m.call(i);
    	        }
    	        finally { if (e) throw e.error; }
    	    }
    	    return ar;
    	};
    	var __spreadArray = (commonjsGlobal && commonjsGlobal.__spreadArray) || function (to, from, pack) {
    	    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    	        if (ar || !(i in from)) {
    	            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
    	            ar[i] = from[i];
    	        }
    	    }
    	    return to.concat(ar || Array.prototype.slice.call(from));
    	};
    	Object.defineProperty(UniqueSet, "__esModule", { value: true });
    	UniqueSet.UniqueSet = void 0;
    	//================================================================
    	/**
    	 * @packageDocumentation
    	 * @module std.base
    	 */
    	//================================================================
    	var SetContainer_1 = requireSetContainer();
    	var ErrorGenerator_1 = requireErrorGenerator();
    	/**
    	 * Basic set container blocking duplicated key.
    	 *
    	 * @template Key Key type
    	 * @template Source Derived type extending this {@link UniqueSet}
    	 * @template IteratorT Iterator type
    	 * @template ReverseT Reverse iterator type
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var UniqueSet$1 = /** @class */ (function (_super) {
    	    __extends(UniqueSet, _super);
    	    function UniqueSet() {
    	        return _super !== null && _super.apply(this, arguments) || this;
    	    }
    	    /* ---------------------------------------------------------
    	        ACCESSOR
    	    --------------------------------------------------------- */
    	    /**
    	     * @inheritDoc
    	     */
    	    UniqueSet.prototype.count = function (key) {
    	        return this.find(key).equals(this.end()) ? 0 : 1;
    	    };
    	    UniqueSet.prototype.insert = function () {
    	        var args = [];
    	        for (var _i = 0; _i < arguments.length; _i++) {
    	            args[_i] = arguments[_i];
    	        }
    	        return _super.prototype.insert.apply(this, __spreadArray([], __read(args), false));
    	    };
    	    UniqueSet.prototype._Insert_by_range = function (first, last) {
    	        for (; !first.equals(last); first = first.next())
    	            this._Insert_by_key(first.value);
    	    };
    	    UniqueSet.prototype.extract = function (param) {
    	        if (param instanceof this.end().constructor)
    	            return this._Extract_by_iterator(param);
    	        else
    	            return this._Extract_by_val(param);
    	    };
    	    UniqueSet.prototype._Extract_by_val = function (key) {
    	        var it = this.find(key);
    	        if (it.equals(this.end()) === true)
    	            throw ErrorGenerator_1.ErrorGenerator.key_nout_found(this, "extract", key);
    	        this._Erase_by_range(it);
    	        return key;
    	    };
    	    UniqueSet.prototype._Extract_by_iterator = function (it) {
    	        if (it.equals(this.end()) === true || this.has(it.value) === false)
    	            return this.end();
    	        this._Erase_by_range(it);
    	        return it;
    	    };
    	    UniqueSet.prototype._Erase_by_val = function (key) {
    	        var it = this.find(key);
    	        if (it.equals(this.end()) === true)
    	            return 0;
    	        this._Erase_by_range(it);
    	        return 1;
    	    };
    	    /* ---------------------------------------------------------
    	        UTILITY
    	    --------------------------------------------------------- */
    	    /**
    	     * @inheritDoc
    	     */
    	    UniqueSet.prototype.merge = function (source) {
    	        for (var it = source.begin(); !it.equals(source.end());) {
    	            if (this.has(it.value) === false) {
    	                this.insert(it.value);
    	                it = source.erase(it);
    	            }
    	            else
    	                it = it.next();
    	        }
    	    };
    	    return UniqueSet;
    	}(SetContainer_1.SetContainer));
    	UniqueSet.UniqueSet = UniqueSet$1;
    	
    	return UniqueSet;
    }

    var IHashContainer = {};

    var IAssociativeContainer = {};

    var hasRequiredIAssociativeContainer;

    function requireIAssociativeContainer () {
    	if (hasRequiredIAssociativeContainer) return IAssociativeContainer;
    	hasRequiredIAssociativeContainer = 1;
    	(function (exports) {
    		var __read = (commonjsGlobal && commonjsGlobal.__read) || function (o, n) {
    		    var m = typeof Symbol === "function" && o[Symbol.iterator];
    		    if (!m) return o;
    		    var i = m.call(o), r, ar = [], e;
    		    try {
    		        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    		    }
    		    catch (error) { e = { error: error }; }
    		    finally {
    		        try {
    		            if (r && !r.done && (m = i["return"])) m.call(i);
    		        }
    		        finally { if (e) throw e.error; }
    		    }
    		    return ar;
    		};
    		var __spreadArray = (commonjsGlobal && commonjsGlobal.__spreadArray) || function (to, from, pack) {
    		    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    		        if (ar || !(i in from)) {
    		            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
    		            ar[i] = from[i];
    		        }
    		    }
    		    return to.concat(ar || Array.prototype.slice.call(from));
    		};
    		Object.defineProperty(exports, "__esModule", { value: true });
    		exports.IAssociativeContainer = void 0;
    		(function (IAssociativeContainer) {
    		    /**
    		     * @internal
    		     */
    		    function construct(source) {
    		        var args = [];
    		        for (var _i = 1; _i < arguments.length; _i++) {
    		            args[_i - 1] = arguments[_i];
    		        }
    		        var ramda;
    		        var tail;
    		        if (args.length >= 1 && args[0] instanceof Array) {
    		            // INITIALIZER LIST CONSTRUCTOR
    		            ramda = function () {
    		                var items = args[0];
    		                source.push.apply(source, __spreadArray([], __read(items), false));
    		            };
    		            tail = args.slice(1);
    		        }
    		        else if (args.length >= 2 &&
    		            args[0].next instanceof Function &&
    		            args[1].next instanceof Function) {
    		            // RANGE CONSTRUCTOR
    		            ramda = function () {
    		                var first = args[0];
    		                var last = args[1];
    		                source.assign(first, last);
    		            };
    		            tail = args.slice(2);
    		        }
    		        else {
    		            // DEFAULT CONSTRUCTOR
    		            ramda = null;
    		            tail = args;
    		        }
    		        return { ramda: ramda, tail: tail };
    		    }
    		    IAssociativeContainer.construct = construct;
    		})(exports.IAssociativeContainer || (exports.IAssociativeContainer = {}));
    		
    } (IAssociativeContainer));
    	return IAssociativeContainer;
    }

    var hash = {};

    var uid = {};

    var Global = {};

    var hasRequiredGlobal$1;

    function requireGlobal$1 () {
    	if (hasRequiredGlobal$1) return Global;
    	hasRequiredGlobal$1 = 1;
    	Object.defineProperty(Global, "__esModule", { value: true });
    	Global._Get_root = void 0;
    	//================================================================
    	/**
    	 * @packageDocumentation
    	 * @module std.internal
    	 */
    	//================================================================
    	var node_1 = node;
    	/**
    	 * @internal
    	 */
    	function _Get_root() {
    	    if (__s_pRoot === null) {
    	        __s_pRoot = ((0, node_1.is_node)() ? commonjsGlobal : self);
    	        if (__s_pRoot.__s_iUID === undefined)
    	            __s_pRoot.__s_iUID = 0;
    	    }
    	    return __s_pRoot;
    	}
    	Global._Get_root = _Get_root;
    	/**
    	 * @internal
    	 */
    	var __s_pRoot = null;
    	
    	return Global;
    }

    var hasRequiredUid;

    function requireUid () {
    	if (hasRequiredUid) return uid;
    	hasRequiredUid = 1;
    	Object.defineProperty(uid, "__esModule", { value: true });
    	uid.get_uid = void 0;
    	//================================================================
    	/**
    	 * @packageDocumentation
    	 * @module std
    	 */
    	//================================================================
    	var Global_1 = requireGlobal$1();
    	/**
    	 * Get unique identifier.
    	 *
    	 * @param obj Target object.
    	 * @return The identifier number.
    	 */
    	function get_uid(obj) {
    	    // NO UID EXISTS, THEN ISSUE ONE.
    	    if (obj instanceof Object) {
    	        if (obj.hasOwnProperty("__get_m_iUID") === false) {
    	            var uid_1 = ++(0, Global_1._Get_root)().__s_iUID;
    	            Object.defineProperty(obj, "__get_m_iUID", {
    	                value: function () {
    	                    return uid_1;
    	                },
    	            });
    	        }
    	        // RETURNS
    	        return obj.__get_m_iUID();
    	    }
    	    else if (obj === undefined)
    	        return -1;
    	    // is null
    	    else
    	        return 0;
    	}
    	uid.get_uid = get_uid;
    	
    	return uid;
    }

    var hasRequiredHash;

    function requireHash () {
    	if (hasRequiredHash) return hash;
    	hasRequiredHash = 1;
    	var __values = (commonjsGlobal && commonjsGlobal.__values) || function(o) {
    	    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    	    if (m) return m.call(o);
    	    if (o && typeof o.length === "number") return {
    	        next: function () {
    	            if (o && i >= o.length) o = void 0;
    	            return { value: o && o[i++], done: !o };
    	        }
    	    };
    	    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    	};
    	Object.defineProperty(hash, "__esModule", { value: true });
    	hash.hash = void 0;
    	var uid_1 = requireUid();
    	/**
    	 * Hash function.
    	 *
    	 * @param itemList The items to be hashed.
    	 * @return The hash code.
    	 */
    	function hash$1() {
    	    var e_1, _a;
    	    var itemList = [];
    	    for (var _i = 0; _i < arguments.length; _i++) {
    	        itemList[_i] = arguments[_i];
    	    }
    	    var ret = INIT_VALUE;
    	    try {
    	        for (var itemList_1 = __values(itemList), itemList_1_1 = itemList_1.next(); !itemList_1_1.done; itemList_1_1 = itemList_1.next()) {
    	            var item = itemList_1_1.value;
    	            item = item ? item.valueOf() : item;
    	            var type = typeof item;
    	            if (type === "boolean")
    	                // BOOLEAN -> 1 BYTE
    	                ret = _Hash_boolean(item, ret);
    	            else if (type === "number" || type === "bigint")
    	                // NUMBER -> 8 BYTES
    	                ret = _Hash_number(item, ret);
    	            else if (type === "string")
    	                // STRING -> {LENGTH} BYTES
    	                ret = _Hash_string(item, ret);
    	            else if (item instanceof Object &&
    	                item.hashCode instanceof Function) {
    	                var hashed = item.hashCode();
    	                if (itemList.length === 1)
    	                    return hashed;
    	                else {
    	                    ret = ret ^ hashed;
    	                    ret *= MULTIPLIER;
    	                }
    	            } // object | null | undefined
    	            else
    	                ret = _Hash_number((0, uid_1.get_uid)(item), ret);
    	        }
    	    }
    	    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    	    finally {
    	        try {
    	            if (itemList_1_1 && !itemList_1_1.done && (_a = itemList_1.return)) _a.call(itemList_1);
    	        }
    	        finally { if (e_1) throw e_1.error; }
    	    }
    	    return Math.abs(ret);
    	}
    	hash.hash = hash$1;
    	function _Hash_boolean(val, ret) {
    	    ret ^= val ? 1 : 0;
    	    ret *= MULTIPLIER;
    	    return ret;
    	}
    	function _Hash_number(val, ret) {
    	    return _Hash_string(val.toString(), ret);
    	    // // ------------------------------------------
    	    // //    IN C++
    	    // //        CONSIDER A NUMBER AS A STRING
    	    // //        HASH<STRING>((CHAR*)&VAL, 8)
    	    // // ------------------------------------------
    	    // // CONSTRUCT BUFFER AND BYTE_ARRAY
    	    // const buffer: ArrayBuffer = new ArrayBuffer(8);
    	    // const byteArray: Int8Array = new Int8Array(buffer);
    	    // const valueArray: Float64Array = new Float64Array(buffer);
    	    // valueArray[0] = val;
    	    // for (let i: number = 0; i < byteArray.length; ++i)
    	    // {
    	    //     const byte = (byteArray[i] < 0) ? byteArray[i] + 256 : byteArray[i];
    	    //     ret ^= byte;
    	    //     ret *= _HASH_MULTIPLIER;
    	    // }
    	    // return Math.abs(ret);
    	}
    	function _Hash_string(str, ret) {
    	    for (var i = 0; i < str.length; ++i) {
    	        ret ^= str.charCodeAt(i);
    	        ret *= MULTIPLIER;
    	    }
    	    return Math.abs(ret);
    	}
    	/* ---------------------------------------------------------
    	    RESERVED ITEMS
    	--------------------------------------------------------- */
    	var INIT_VALUE = 2166136261;
    	var MULTIPLIER = 16777619;
    	
    	return hash;
    }

    var comparators = {};

    var hasRequiredComparators;

    function requireComparators () {
    	if (hasRequiredComparators) return comparators;
    	hasRequiredComparators = 1;
    	Object.defineProperty(comparators, "__esModule", { value: true });
    	comparators.greater_equal = comparators.greater = comparators.less_equal = comparators.less = comparators.not_equal_to = comparators.equal_to = void 0;
    	var uid_1 = requireUid();
    	/**
    	 * Test whether two arguments are equal.
    	 *
    	 * @param x The first argument to compare.
    	 * @param y The second argument to compare.
    	 * @return Whether two arguments are equal or not.
    	 */
    	function equal_to(x, y) {
    	    // CONVERT TO PRIMITIVE TYPE
    	    x = x ? x.valueOf() : x;
    	    y = y ? y.valueOf() : y;
    	    // DO COMPARE
    	    if (x instanceof Object &&
    	        x.equals instanceof Function)
    	        return x.equals(y);
    	    else
    	        return x === y;
    	}
    	comparators.equal_to = equal_to;
    	/**
    	 * Test whether two arguments are not equal.
    	 *
    	 * @param x The first argument to compare.
    	 * @param y The second argument to compare.
    	 * @return Returns `true`, if two arguments are not equal, otherwise `false`.
    	 */
    	function not_equal_to(x, y) {
    	    return !equal_to(x, y);
    	}
    	comparators.not_equal_to = not_equal_to;
    	/**
    	 * Test whether *x* is less than *y*.
    	 *
    	 * @param x The first argument to compare.
    	 * @param y The second argument to compare.
    	 * @return Whether *x* is less than *y*.
    	 */
    	function less(x, y) {
    	    // CONVERT TO PRIMITIVE TYPE
    	    x = x.valueOf();
    	    y = y.valueOf();
    	    // DO COMPARE
    	    if (x instanceof Object)
    	        if (x.less instanceof Function)
    	            // has less()
    	            return x.less(y);
    	        else
    	            return (0, uid_1.get_uid)(x) < (0, uid_1.get_uid)(y);
    	    else
    	        return x < y;
    	}
    	comparators.less = less;
    	/**
    	 * Test whether *x* is less than or equal to *y*.
    	 *
    	 * @param x The first argument to compare.
    	 * @param y The second argument to compare.
    	 * @return Whether *x* is less than or equal to *y*.
    	 */
    	function less_equal(x, y) {
    	    return less(x, y) || equal_to(x, y);
    	}
    	comparators.less_equal = less_equal;
    	/**
    	 * Test whether *x* is greater than *y*.
    	 *
    	 * @param x The first argument to compare.
    	 * @param y The second argument to compare.
    	 * @return Whether *x* is greater than *y*.
    	 */
    	function greater(x, y) {
    	    return !less_equal(x, y);
    	}
    	comparators.greater = greater;
    	/**
    	 * Test whether *x* is greater than or equal to *y*.
    	 *
    	 * @param x The first argument to compare.
    	 * @param y The second argument to compare.
    	 * @return Whether *x* is greater than or equal to *y*.
    	 */
    	function greater_equal(x, y) {
    	    return !less(x, y);
    	}
    	comparators.greater_equal = greater_equal;
    	
    	return comparators;
    }

    var hasRequiredIHashContainer;

    function requireIHashContainer () {
    	if (hasRequiredIHashContainer) return IHashContainer;
    	hasRequiredIHashContainer = 1;
    	(function (exports) {
    		var __read = (commonjsGlobal && commonjsGlobal.__read) || function (o, n) {
    		    var m = typeof Symbol === "function" && o[Symbol.iterator];
    		    if (!m) return o;
    		    var i = m.call(o), r, ar = [], e;
    		    try {
    		        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    		    }
    		    catch (error) { e = { error: error }; }
    		    finally {
    		        try {
    		            if (r && !r.done && (m = i["return"])) m.call(i);
    		        }
    		        finally { if (e) throw e.error; }
    		    }
    		    return ar;
    		};
    		var __spreadArray = (commonjsGlobal && commonjsGlobal.__spreadArray) || function (to, from, pack) {
    		    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    		        if (ar || !(i in from)) {
    		            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
    		            ar[i] = from[i];
    		        }
    		    }
    		    return to.concat(ar || Array.prototype.slice.call(from));
    		};
    		Object.defineProperty(exports, "__esModule", { value: true });
    		exports.IHashContainer = void 0;
    		//================================================================
    		/**
    		 * @packageDocumentation
    		 * @module std.internal
    		 */
    		//================================================================
    		var IAssociativeContainer_1 = requireIAssociativeContainer();
    		var hash_1 = requireHash();
    		var comparators_1 = requireComparators();
    		(function (IHashContainer) {
    		    /**
    		     * @internal
    		     */
    		    function construct(source, Source, bucketFactory) {
    		        var args = [];
    		        for (var _i = 3; _i < arguments.length; _i++) {
    		            args[_i - 3] = arguments[_i];
    		        }
    		        // DECLARE MEMBERS
    		        var post_process = null;
    		        var hash_function = hash_1.hash;
    		        var key_eq = comparators_1.equal_to;
    		        //----
    		        // INITIALIZE MEMBERS AND POST-PROCESS
    		        //----
    		        // BRANCH - METHOD OVERLOADINGS
    		        if (args.length === 1 && args[0] instanceof Source) {
    		            // PARAMETERS
    		            var container_1 = args[0];
    		            hash_function = container_1.hash_function();
    		            key_eq = container_1.key_eq();
    		            // COPY CONSTRUCTOR
    		            post_process = function () {
    		                var first = container_1.begin();
    		                var last = container_1.end();
    		                source.assign(first, last);
    		            };
    		        }
    		        else {
    		            var tuple = IAssociativeContainer_1.IAssociativeContainer.construct.apply(IAssociativeContainer_1.IAssociativeContainer, __spreadArray([source], __read(args), false));
    		            post_process = tuple.ramda;
    		            if (tuple.tail.length >= 1)
    		                hash_function = tuple.tail[0];
    		            if (tuple.tail.length >= 2)
    		                key_eq = tuple.tail[1];
    		        }
    		        //----
    		        // DO PROCESS
    		        //----
    		        // CONSTRUCT BUCKET
    		        bucketFactory(hash_function, key_eq);
    		        // ACT POST-PROCESS
    		        if (post_process !== null)
    		            post_process();
    		    }
    		    IHashContainer.construct = construct;
    		})(exports.IHashContainer || (exports.IHashContainer = {}));
    		
    } (IHashContainer));
    	return IHashContainer;
    }

    var SetElementList = {};

    var ListContainer = {};

    var ListIterator = {};

    var hasRequiredListIterator;

    function requireListIterator () {
    	if (hasRequiredListIterator) return ListIterator;
    	hasRequiredListIterator = 1;
    	Object.defineProperty(ListIterator, "__esModule", { value: true });
    	ListIterator.ListIterator = void 0;
    	var ErrorGenerator_1 = requireErrorGenerator();
    	/**
    	 * Basic List Iterator.
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var ListIterator$1 = /** @class */ (function () {
    	    /* ---------------------------------------------------------------
    	        CONSTRUCTORS
    	    --------------------------------------------------------------- */
    	    function ListIterator(prev, next, value) {
    	        this.prev_ = prev;
    	        this.next_ = next;
    	        this.value_ = value;
    	    }
    	    /**
    	     * @internal
    	     */
    	    ListIterator._Set_prev = function (it, prev) {
    	        it.prev_ = prev;
    	    };
    	    /**
    	     * @internal
    	     */
    	    ListIterator._Set_next = function (it, next) {
    	        it.next_ = next;
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    ListIterator.prototype.prev = function () {
    	        return this.prev_;
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    ListIterator.prototype.next = function () {
    	        return this.next_;
    	    };
    	    Object.defineProperty(ListIterator.prototype, "value", {
    	        /**
    	         * @inheritDoc
    	         */
    	        get: function () {
    	            this._Try_value();
    	            return this.value_;
    	        },
    	        enumerable: false,
    	        configurable: true
    	    });
    	    ListIterator.prototype._Try_value = function () {
    	        if (this.value_ === undefined &&
    	            this.equals(this.source().end()) === true)
    	            throw ErrorGenerator_1.ErrorGenerator.iterator_end_value(this.source());
    	    };
    	    /* ---------------------------------------------------------------
    	        COMPARISON
    	    --------------------------------------------------------------- */
    	    /**
    	     * @inheritDoc
    	     */
    	    ListIterator.prototype.equals = function (obj) {
    	        return this === obj;
    	    };
    	    return ListIterator;
    	}());
    	ListIterator.ListIterator = ListIterator$1;
    	
    	return ListIterator;
    }

    var Repeater = {};

    var hasRequiredRepeater;

    function requireRepeater () {
    	if (hasRequiredRepeater) return Repeater;
    	hasRequiredRepeater = 1;
    	Object.defineProperty(Repeater, "__esModule", { value: true });
    	Repeater.Repeater = void 0;
    	var Repeater$1 = /** @class */ (function () {
    	    /* ---------------------------------------------------------
    	        CONSTRUCTORS
    	    --------------------------------------------------------- */
    	    function Repeater(index, value) {
    	        this.index_ = index;
    	        this.value_ = value;
    	    }
    	    /* ---------------------------------------------------------
    	        ACCESSORS
    	    --------------------------------------------------------- */
    	    Repeater.prototype.index = function () {
    	        return this.index_;
    	    };
    	    Object.defineProperty(Repeater.prototype, "value", {
    	        get: function () {
    	            return this.value_;
    	        },
    	        enumerable: false,
    	        configurable: true
    	    });
    	    /* ---------------------------------------------------------
    	        MOVERS & COMPARE
    	    --------------------------------------------------------- */
    	    Repeater.prototype.next = function () {
    	        ++this.index_;
    	        return this;
    	    };
    	    Repeater.prototype.equals = function (obj) {
    	        return this.index_ === obj.index_;
    	    };
    	    return Repeater;
    	}());
    	Repeater.Repeater = Repeater$1;
    	
    	return Repeater;
    }

    var global$1 = {};

    var hasRequiredGlobal;

    function requireGlobal () {
    	if (hasRequiredGlobal) return global$1;
    	hasRequiredGlobal = 1;
    	Object.defineProperty(global$1, "__esModule", { value: true });
    	global$1.next = global$1.prev = global$1.advance = global$1.distance = global$1.size = global$1.empty = void 0;
    	var InvalidArgument_1 = requireInvalidArgument();
    	/* =========================================================
    	    GLOBAL FUNCTIONS
    	        - ACCESSORS
    	        - MOVERS
    	        - FACTORIES
    	============================================================
    	    ACCESSORS
    	--------------------------------------------------------- */
    	/**
    	 * Test whether a container is empty.
    	 *
    	 * @param source Target container.
    	 * @return Whether empty or not.
    	 */
    	function empty(source) {
    	    if (source instanceof Array)
    	        return source.length !== 0;
    	    else
    	        return source.empty();
    	}
    	global$1.empty = empty;
    	/**
    	 * Get number of elements of a container.
    	 *
    	 * @param source Target container.
    	 * @return The number of elements in the container.
    	 */
    	function size(source) {
    	    if (source instanceof Array)
    	        return source.length;
    	    else
    	        return source.size();
    	}
    	global$1.size = size;
    	function distance(first, last) {
    	    if (first.index instanceof Function)
    	        return _Distance_via_index(first, last);
    	    var ret = 0;
    	    for (; !first.equals(last); first = first.next())
    	        ++ret;
    	    return ret;
    	}
    	global$1.distance = distance;
    	function _Distance_via_index(first, last) {
    	    var x = first.index();
    	    var y = last.index();
    	    if (first.base instanceof Function)
    	        return x - y;
    	    else
    	        return y - x;
    	}
    	function advance(it, n) {
    	    if (n === 0)
    	        return it;
    	    else if (it.advance instanceof Function)
    	        return it.advance(n);
    	    var stepper;
    	    if (n < 0) {
    	        if (!(it.prev instanceof Function))
    	            throw new InvalidArgument_1.InvalidArgument("Error on std.advance(): parametric iterator is not a bi-directional iterator, thus advancing to negative direction is not possible.");
    	        stepper = function (it) { return it.prev(); };
    	        n = -n;
    	    }
    	    else
    	        stepper = function (it) { return it.next(); };
    	    while (n-- > 0)
    	        it = stepper(it);
    	    return it;
    	}
    	global$1.advance = advance;
    	/**
    	 * Get previous iterator.
    	 *
    	 * @param it Iterator to move.
    	 * @param n Step to move prev.
    	 * @return An iterator moved to prev *n* steps.
    	 */
    	function prev(it, n) {
    	    if (n === void 0) { n = 1; }
    	    if (n === 1)
    	        return it.prev();
    	    else
    	        return advance(it, -n);
    	}
    	global$1.prev = prev;
    	/**
    	 * Get next iterator.
    	 *
    	 * @param it Iterator to move.
    	 * @param n Step to move next.
    	 * @return Iterator moved to next *n* steps.
    	 */
    	function next(it, n) {
    	    if (n === void 0) { n = 1; }
    	    if (n === 1)
    	        return it.next();
    	    else
    	        return advance(it, n);
    	}
    	global$1.next = next;
    	
    	return global$1;
    }

    var hasRequiredListContainer;

    function requireListContainer () {
    	if (hasRequiredListContainer) return ListContainer;
    	hasRequiredListContainer = 1;
    	var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    	    var extendStatics = function (d, b) {
    	        extendStatics = Object.setPrototypeOf ||
    	            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    	            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    	        return extendStatics(d, b);
    	    };
    	    return function (d, b) {
    	        if (typeof b !== "function" && b !== null)
    	            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    	        extendStatics(d, b);
    	        function __() { this.constructor = d; }
    	        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    	    };
    	})();
    	var __read = (commonjsGlobal && commonjsGlobal.__read) || function (o, n) {
    	    var m = typeof Symbol === "function" && o[Symbol.iterator];
    	    if (!m) return o;
    	    var i = m.call(o), r, ar = [], e;
    	    try {
    	        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    	    }
    	    catch (error) { e = { error: error }; }
    	    finally {
    	        try {
    	            if (r && !r.done && (m = i["return"])) m.call(i);
    	        }
    	        finally { if (e) throw e.error; }
    	    }
    	    return ar;
    	};
    	Object.defineProperty(ListContainer, "__esModule", { value: true });
    	ListContainer.ListContainer = void 0;
    	var Container_1 = requireContainer();
    	var ListIterator_1 = requireListIterator();
    	var Repeater_1 = requireRepeater();
    	var NativeArrayIterator_1 = requireNativeArrayIterator();
    	var global_1 = requireGlobal();
    	var ErrorGenerator_1 = requireErrorGenerator();
    	/**
    	 * Basic List Container.
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var ListContainer$1 = /** @class */ (function (_super) {
    	    __extends(ListContainer, _super);
    	    /* ---------------------------------------------------------
    	        CONSTRUCTORS
    	    --------------------------------------------------------- */
    	    /**
    	     * Default Constructor.
    	     */
    	    function ListContainer() {
    	        var _this = _super.call(this) || this;
    	        // INIT MEMBERS
    	        _this.end_ = _this._Create_iterator(null, null);
    	        _this.clear();
    	        return _this;
    	    }
    	    ListContainer.prototype.assign = function (par1, par2) {
    	        this.clear();
    	        this.insert(this.end(), par1, par2);
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    ListContainer.prototype.clear = function () {
    	        // DISCONNECT NODES
    	        ListIterator_1.ListIterator._Set_prev(this.end_, this.end_);
    	        ListIterator_1.ListIterator._Set_next(this.end_, this.end_);
    	        // RE-SIZE -> 0
    	        this.begin_ = this.end_;
    	        this.size_ = 0;
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    ListContainer.prototype.resize = function (n) {
    	        var expansion = n - this.size();
    	        if (expansion > 0)
    	            this.insert(this.end(), expansion, undefined);
    	        else if (expansion < 0)
    	            this.erase((0, global_1.advance)(this.end(), -expansion), this.end());
    	    };
    	    /* ---------------------------------------------------------
    	        ACCESSORS
    	    --------------------------------------------------------- */
    	    /**
    	     * @inheritDoc
    	     */
    	    ListContainer.prototype.begin = function () {
    	        return this.begin_;
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    ListContainer.prototype.end = function () {
    	        return this.end_;
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    ListContainer.prototype.size = function () {
    	        return this.size_;
    	    };
    	    /* =========================================================
    	        ELEMENTS I/O
    	            - PUSH & POP
    	            - INSERT
    	            - ERASE
    	            - POST-PROCESS
    	    ============================================================
    	        PUSH & POP
    	    --------------------------------------------------------- */
    	    /**
    	     * @inheritDoc
    	     */
    	    ListContainer.prototype.push_front = function (val) {
    	        this.insert(this.begin_, val);
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    ListContainer.prototype.push_back = function (val) {
    	        this.insert(this.end_, val);
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    ListContainer.prototype.pop_front = function () {
    	        if (this.empty() === true)
    	            throw ErrorGenerator_1.ErrorGenerator.empty(this.end_.source().constructor.name, "pop_front");
    	        this.erase(this.begin_);
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    ListContainer.prototype.pop_back = function () {
    	        if (this.empty() === true)
    	            throw ErrorGenerator_1.ErrorGenerator.empty(this.end_.source().constructor.name, "pop_back");
    	        this.erase(this.end_.prev());
    	    };
    	    /* ---------------------------------------------------------
    	        INSERT
    	    --------------------------------------------------------- */
    	    /**
    	     * @inheritDoc
    	     */
    	    ListContainer.prototype.push = function () {
    	        var items = [];
    	        for (var _i = 0; _i < arguments.length; _i++) {
    	            items[_i] = arguments[_i];
    	        }
    	        if (items.length === 0)
    	            return this.size();
    	        // INSERT BY RANGE
    	        var first = new NativeArrayIterator_1.NativeArrayIterator(items, 0);
    	        var last = new NativeArrayIterator_1.NativeArrayIterator(items, items.length);
    	        this._Insert_by_range(this.end(), first, last);
    	        // RETURN SIZE
    	        return this.size();
    	    };
    	    ListContainer.prototype.insert = function (pos) {
    	        var args = [];
    	        for (var _i = 1; _i < arguments.length; _i++) {
    	            args[_i - 1] = arguments[_i];
    	        }
    	        // VALIDATION
    	        if (pos.source() !== this.end_.source())
    	            throw ErrorGenerator_1.ErrorGenerator.not_my_iterator(this.end_.source(), "insert");
    	        else if (pos.erased_ === true)
    	            throw ErrorGenerator_1.ErrorGenerator.erased_iterator(this.end_.source(), "insert");
    	        // BRANCHES
    	        if (args.length === 1)
    	            return this._Insert_by_repeating_val(pos, 1, args[0]);
    	        else if (args.length === 2 && typeof args[0] === "number")
    	            return this._Insert_by_repeating_val(pos, args[0], args[1]);
    	        else
    	            return this._Insert_by_range(pos, args[0], args[1]);
    	    };
    	    ListContainer.prototype._Insert_by_repeating_val = function (position, n, val) {
    	        var first = new Repeater_1.Repeater(0, val);
    	        var last = new Repeater_1.Repeater(n);
    	        return this._Insert_by_range(position, first, last);
    	    };
    	    ListContainer.prototype._Insert_by_range = function (position, begin, end) {
    	        var prev = position.prev();
    	        var first = null;
    	        var size = 0;
    	        for (var it = begin; it.equals(end) === false; it = it.next()) {
    	            // CONSTRUCT ITEM, THE NEW ELEMENT
    	            var item = this._Create_iterator(prev, null, it.value);
    	            if (size === 0)
    	                first = item;
    	            // PLACE ITEM ON THE NEXT OF "PREV"
    	            ListIterator_1.ListIterator._Set_next(prev, item);
    	            // SHIFT CURRENT ITEM TO PREVIOUS
    	            prev = item;
    	            ++size;
    	        }
    	        // WILL FIRST BE THE BEGIN?
    	        if (position.equals(this.begin()) === true)
    	            this.begin_ = first;
    	        // CONNECT BETWEEN LAST AND POSITION
    	        ListIterator_1.ListIterator._Set_next(prev, position);
    	        ListIterator_1.ListIterator._Set_prev(position, prev);
    	        this.size_ += size;
    	        return first;
    	    };
    	    ListContainer.prototype.erase = function (first, last) {
    	        if (last === void 0) { last = first.next(); }
    	        return this._Erase_by_range(first, last);
    	    };
    	    ListContainer.prototype._Erase_by_range = function (first, last) {
    	        // VALIDATION
    	        if (first.source() !== this.end_.source())
    	            throw ErrorGenerator_1.ErrorGenerator.not_my_iterator(this.end_.source(), "insert");
    	        else if (first.erased_ === true)
    	            throw ErrorGenerator_1.ErrorGenerator.erased_iterator(this.end_.source(), "insert");
    	        else if (first.equals(this.end_))
    	            return this.end_;
    	        // FIND PREV AND NEXT
    	        var prev = first.prev();
    	        // SHRINK
    	        ListIterator_1.ListIterator._Set_next(prev, last);
    	        ListIterator_1.ListIterator._Set_prev(last, prev);
    	        for (var it = first; !it.equals(last); it = it.next()) {
    	            it.erased_ = true;
    	            --this.size_;
    	        }
    	        if (first.equals(this.begin_))
    	            this.begin_ = last;
    	        return last;
    	    };
    	    /* ---------------------------------------------------------
    	        SWAP
    	    --------------------------------------------------------- */
    	    /**
    	     * @inheritDoc
    	     */
    	    ListContainer.prototype.swap = function (obj) {
    	        var _a, _b, _c;
    	        _a = __read([obj.begin_, this.begin_], 2), this.begin_ = _a[0], obj.begin_ = _a[1];
    	        _b = __read([obj.end_, this.end_], 2), this.end_ = _b[0], obj.end_ = _b[1];
    	        _c = __read([obj.size_, this.size_], 2), this.size_ = _c[0], obj.size_ = _c[1];
    	    };
    	    return ListContainer;
    	}(Container_1.Container));
    	ListContainer.ListContainer = ListContainer$1;
    	
    	return ListContainer;
    }

    var ReverseIterator = {};

    var hasRequiredReverseIterator;

    function requireReverseIterator () {
    	if (hasRequiredReverseIterator) return ReverseIterator;
    	hasRequiredReverseIterator = 1;
    	Object.defineProperty(ReverseIterator, "__esModule", { value: true });
    	ReverseIterator.ReverseIterator = void 0;
    	/**
    	 * Basic reverse iterator.
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var ReverseIterator$1 = /** @class */ (function () {
    	    /* ---------------------------------------------------------
    	        CONSTRUCTORS
    	    --------------------------------------------------------- */
    	    /**
    	     * Initializer Constructor.
    	     *
    	     * @param base The base iterator.
    	     */
    	    function ReverseIterator(base) {
    	        this.base_ = base.prev();
    	    }
    	    /* ---------------------------------------------------------
    	        ACCESSORS
    	    --------------------------------------------------------- */
    	    /**
    	     * Get source container.
    	     *
    	     * @return The source container.
    	     */
    	    ReverseIterator.prototype.source = function () {
    	        return this.base_.source();
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    ReverseIterator.prototype.base = function () {
    	        return this.base_.next();
    	    };
    	    Object.defineProperty(ReverseIterator.prototype, "value", {
    	        /**
    	         * @inheritDoc
    	         */
    	        get: function () {
    	            return this.base_.value;
    	        },
    	        enumerable: false,
    	        configurable: true
    	    });
    	    /* ---------------------------------------------------------
    	        MOVERS
    	    --------------------------------------------------------- */
    	    /**
    	     * @inheritDoc
    	     */
    	    ReverseIterator.prototype.prev = function () {
    	        // this.base().next()
    	        return this._Create_neighbor(this.base().next());
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    ReverseIterator.prototype.next = function () {
    	        // this.base().prev()
    	        return this._Create_neighbor(this.base_);
    	    };
    	    /* ---------------------------------------------------------
    	        COMPARES
    	    --------------------------------------------------------- */
    	    /**
    	     * @inheritDoc
    	     */
    	    ReverseIterator.prototype.equals = function (obj) {
    	        return this.base_.equals(obj.base_);
    	    };
    	    return ReverseIterator;
    	}());
    	ReverseIterator.ReverseIterator = ReverseIterator$1;
    	
    	return ReverseIterator;
    }

    var hasRequiredSetElementList;

    function requireSetElementList () {
    	if (hasRequiredSetElementList) return SetElementList;
    	hasRequiredSetElementList = 1;
    	(function (exports) {
    		var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    		    var extendStatics = function (d, b) {
    		        extendStatics = Object.setPrototypeOf ||
    		            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    		            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    		        return extendStatics(d, b);
    		    };
    		    return function (d, b) {
    		        if (typeof b !== "function" && b !== null)
    		            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    		        extendStatics(d, b);
    		        function __() { this.constructor = d; }
    		        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    		    };
    		})();
    		var __read = (commonjsGlobal && commonjsGlobal.__read) || function (o, n) {
    		    var m = typeof Symbol === "function" && o[Symbol.iterator];
    		    if (!m) return o;
    		    var i = m.call(o), r, ar = [], e;
    		    try {
    		        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    		    }
    		    catch (error) { e = { error: error }; }
    		    finally {
    		        try {
    		            if (r && !r.done && (m = i["return"])) m.call(i);
    		        }
    		        finally { if (e) throw e.error; }
    		    }
    		    return ar;
    		};
    		Object.defineProperty(exports, "__esModule", { value: true });
    		exports.SetElementList = void 0;
    		//================================================================
    		/**
    		 * @packageDocumentation
    		 * @module std.internal
    		 */
    		//================================================================
    		var ListContainer_1 = requireListContainer();
    		var ListIterator_1 = requireListIterator();
    		var ReverseIterator_1 = requireReverseIterator();
    		/**
    		 * Doubly Linked List storing set elements.
    		 *
    		 * @template Key Key type
    		 * @template Unique Whether duplicated key is blocked or not
    		 * @template Source Source container type
    		 *
    		 * @author Jeongho Nam - https://github.com/samchon
    		 */
    		var SetElementList = /** @class */ (function (_super) {
    		    __extends(SetElementList, _super);
    		    /* ---------------------------------------------------------
    		        CONSTRUCTORS
    		    --------------------------------------------------------- */
    		    function SetElementList(associative) {
    		        var _this = _super.call(this) || this;
    		        _this.associative_ = associative;
    		        return _this;
    		    }
    		    SetElementList.prototype._Create_iterator = function (prev, next, val) {
    		        return SetElementList.Iterator.create(this, prev, next, val);
    		    };
    		    /**
    		     * @internal
    		     */
    		    SetElementList._Swap_associative = function (x, y) {
    		        var _a;
    		        _a = __read([y.associative_, x.associative_], 2), x.associative_ = _a[0], y.associative_ = _a[1];
    		    };
    		    /* ---------------------------------------------------------
    		        ACCESSORS
    		    --------------------------------------------------------- */
    		    SetElementList.prototype.associative = function () {
    		        return this.associative_;
    		    };
    		    return SetElementList;
    		}(ListContainer_1.ListContainer));
    		exports.SetElementList = SetElementList;
    		/**
    		 *
    		 */
    		(function (SetElementList) {
    		    /**
    		     * Iterator of set container storing elements in a list.
    		     *
    		     * @template Key Key type
    		     * @template Unique Whether duplicated key is blocked or not
    		     * @template Source Source container type
    		     *
    		     * @author Jeongho Nam - https://github.com/samchon
    		     */
    		    var Iterator = /** @class */ (function (_super) {
    		        __extends(Iterator, _super);
    		        /* ---------------------------------------------------------
    		            CONSTRUCTORS
    		        --------------------------------------------------------- */
    		        function Iterator(list, prev, next, val) {
    		            var _this = _super.call(this, prev, next, val) || this;
    		            _this.source_ = list;
    		            return _this;
    		        }
    		        /**
    		         * @internal
    		         */
    		        Iterator.create = function (list, prev, next, val) {
    		            return new Iterator(list, prev, next, val);
    		        };
    		        /**
    		         * @inheritDoc
    		         */
    		        Iterator.prototype.reverse = function () {
    		            return new ReverseIterator(this);
    		        };
    		        /* ---------------------------------------------------------
    		            ACCESSORS
    		        --------------------------------------------------------- */
    		        /**
    		         * @inheritDoc
    		         */
    		        Iterator.prototype.source = function () {
    		            return this.source_.associative();
    		        };
    		        return Iterator;
    		    }(ListIterator_1.ListIterator));
    		    SetElementList.Iterator = Iterator;
    		    /**
    		     * Reverser iterator of set container storing elements in a list.
    		     *
    		     * @template Key Key type
    		     * @template Unique Whether duplicated key is blocked or not
    		     * @template Source Source container type
    		     *
    		     * @author Jeongho Nam - https://github.com/samchon
    		     */
    		    var ReverseIterator = /** @class */ (function (_super) {
    		        __extends(ReverseIterator, _super);
    		        function ReverseIterator() {
    		            return _super !== null && _super.apply(this, arguments) || this;
    		        }
    		        ReverseIterator.prototype._Create_neighbor = function (base) {
    		            return new ReverseIterator(base);
    		        };
    		        return ReverseIterator;
    		    }(ReverseIterator_1.ReverseIterator));
    		    SetElementList.ReverseIterator = ReverseIterator;
    		})(SetElementList = exports.SetElementList || (exports.SetElementList = {}));
    		exports.SetElementList = SetElementList;
    		
    } (SetElementList));
    	return SetElementList;
    }

    var SetHashBuckets = {};

    var HashBuckets = {};

    var hasRequiredHashBuckets;

    function requireHashBuckets () {
    	if (hasRequiredHashBuckets) return HashBuckets;
    	hasRequiredHashBuckets = 1;
    	//================================================================
    	/**
    	 * @packageDocumentation
    	 * @module std.internal
    	 */
    	//================================================================
    	var __values = (commonjsGlobal && commonjsGlobal.__values) || function(o) {
    	    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    	    if (m) return m.call(o);
    	    if (o && typeof o.length === "number") return {
    	        next: function () {
    	            if (o && i >= o.length) o = void 0;
    	            return { value: o && o[i++], done: !o };
    	        }
    	    };
    	    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    	};
    	Object.defineProperty(HashBuckets, "__esModule", { value: true });
    	HashBuckets.HashBuckets = void 0;
    	/**
    	 * Hash buckets
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var HashBuckets$1 = /** @class */ (function () {
    	    /* ---------------------------------------------------------
    	        CONSTRUCTORS
    	    --------------------------------------------------------- */
    	    function HashBuckets(fetcher, hasher) {
    	        this.fetcher_ = fetcher;
    	        this.hasher_ = hasher;
    	        this.max_load_factor_ = DEFAULT_MAX_FACTOR;
    	        this.data_ = [];
    	        this.size_ = 0;
    	        this.initialize();
    	    }
    	    HashBuckets.prototype.clear = function () {
    	        this.data_ = [];
    	        this.size_ = 0;
    	        this.initialize();
    	    };
    	    HashBuckets.prototype.rehash = function (length) {
    	        var e_1, _a, e_2, _b;
    	        length = Math.max(length, MIN_BUCKET_COUNT);
    	        var data = [];
    	        for (var i = 0; i < length; ++i)
    	            data.push([]);
    	        try {
    	            for (var _c = __values(this.data_), _d = _c.next(); !_d.done; _d = _c.next()) {
    	                var row = _d.value;
    	                try {
    	                    for (var row_1 = (e_2 = void 0, __values(row)), row_1_1 = row_1.next(); !row_1_1.done; row_1_1 = row_1.next()) {
    	                        var elem = row_1_1.value;
    	                        var index = this.hasher_(this.fetcher_(elem)) % data.length;
    	                        data[index].push(elem);
    	                    }
    	                }
    	                catch (e_2_1) { e_2 = { error: e_2_1 }; }
    	                finally {
    	                    try {
    	                        if (row_1_1 && !row_1_1.done && (_b = row_1.return)) _b.call(row_1);
    	                    }
    	                    finally { if (e_2) throw e_2.error; }
    	                }
    	            }
    	        }
    	        catch (e_1_1) { e_1 = { error: e_1_1 }; }
    	        finally {
    	            try {
    	                if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
    	            }
    	            finally { if (e_1) throw e_1.error; }
    	        }
    	        this.data_ = data;
    	    };
    	    HashBuckets.prototype.reserve = function (length) {
    	        if (length > this.capacity()) {
    	            length = Math.floor(length / this.max_load_factor_);
    	            this.rehash(length);
    	        }
    	    };
    	    HashBuckets.prototype.initialize = function () {
    	        for (var i = 0; i < MIN_BUCKET_COUNT; ++i)
    	            this.data_.push([]);
    	    };
    	    /* ---------------------------------------------------------
    	        ACCESSORS
    	    --------------------------------------------------------- */
    	    HashBuckets.prototype.length = function () {
    	        return this.data_.length;
    	    };
    	    HashBuckets.prototype.capacity = function () {
    	        return this.data_.length * this.max_load_factor_;
    	    };
    	    HashBuckets.prototype.at = function (index) {
    	        return this.data_[index];
    	    };
    	    HashBuckets.prototype.load_factor = function () {
    	        return this.size_ / this.length();
    	    };
    	    HashBuckets.prototype.max_load_factor = function (z) {
    	        if (z === void 0) { z = null; }
    	        if (z === null)
    	            return this.max_load_factor_;
    	        else
    	            this.max_load_factor_ = z;
    	    };
    	    HashBuckets.prototype.hash_function = function () {
    	        return this.hasher_;
    	    };
    	    /* ---------------------------------------------------------
    	        ELEMENTS I/O
    	    --------------------------------------------------------- */
    	    HashBuckets.prototype.index = function (elem) {
    	        return this.hasher_(this.fetcher_(elem)) % this.length();
    	    };
    	    HashBuckets.prototype.insert = function (val) {
    	        var capacity = this.capacity();
    	        if (++this.size_ > capacity)
    	            this.reserve(capacity * 2);
    	        var index = this.index(val);
    	        this.data_[index].push(val);
    	    };
    	    HashBuckets.prototype.erase = function (val) {
    	        var index = this.index(val);
    	        var bucket = this.data_[index];
    	        for (var i = 0; i < bucket.length; ++i)
    	            if (bucket[i] === val) {
    	                bucket.splice(i, 1);
    	                --this.size_;
    	                break;
    	            }
    	    };
    	    return HashBuckets;
    	}());
    	HashBuckets.HashBuckets = HashBuckets$1;
    	var MIN_BUCKET_COUNT = 10;
    	var DEFAULT_MAX_FACTOR = 1.0;
    	
    	return HashBuckets;
    }

    var hasRequiredSetHashBuckets;

    function requireSetHashBuckets () {
    	if (hasRequiredSetHashBuckets) return SetHashBuckets;
    	hasRequiredSetHashBuckets = 1;
    	var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    	    var extendStatics = function (d, b) {
    	        extendStatics = Object.setPrototypeOf ||
    	            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    	            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    	        return extendStatics(d, b);
    	    };
    	    return function (d, b) {
    	        if (typeof b !== "function" && b !== null)
    	            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    	        extendStatics(d, b);
    	        function __() { this.constructor = d; }
    	        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    	    };
    	})();
    	var __read = (commonjsGlobal && commonjsGlobal.__read) || function (o, n) {
    	    var m = typeof Symbol === "function" && o[Symbol.iterator];
    	    if (!m) return o;
    	    var i = m.call(o), r, ar = [], e;
    	    try {
    	        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    	    }
    	    catch (error) { e = { error: error }; }
    	    finally {
    	        try {
    	            if (r && !r.done && (m = i["return"])) m.call(i);
    	        }
    	        finally { if (e) throw e.error; }
    	    }
    	    return ar;
    	};
    	var __values = (commonjsGlobal && commonjsGlobal.__values) || function(o) {
    	    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    	    if (m) return m.call(o);
    	    if (o && typeof o.length === "number") return {
    	        next: function () {
    	            if (o && i >= o.length) o = void 0;
    	            return { value: o && o[i++], done: !o };
    	        }
    	    };
    	    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    	};
    	Object.defineProperty(SetHashBuckets, "__esModule", { value: true });
    	SetHashBuckets.SetHashBuckets = void 0;
    	//================================================================
    	/**
    	 * @packageDocumentation
    	 * @module std.internal
    	 */
    	//================================================================
    	var HashBuckets_1 = requireHashBuckets();
    	/**
    	 * Hash buckets for set containers
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var SetHashBuckets$1 = /** @class */ (function (_super) {
    	    __extends(SetHashBuckets, _super);
    	    /* ---------------------------------------------------------
    	        CONSTRUCTORS
    	    --------------------------------------------------------- */
    	    /**
    	     * Initializer Constructor
    	     *
    	     * @param source Source set container
    	     * @param hasher Hash function
    	     * @param pred Equality function
    	     */
    	    function SetHashBuckets(source, hasher, pred) {
    	        var _this = _super.call(this, fetcher, hasher) || this;
    	        _this.source_ = source;
    	        _this.key_eq_ = pred;
    	        return _this;
    	    }
    	    /**
    	     * @internal
    	     */
    	    SetHashBuckets._Swap_source = function (x, y) {
    	        var _a;
    	        _a = __read([y.source_, x.source_], 2), x.source_ = _a[0], y.source_ = _a[1];
    	    };
    	    /* ---------------------------------------------------------
    	        FINDERS
    	    --------------------------------------------------------- */
    	    SetHashBuckets.prototype.key_eq = function () {
    	        return this.key_eq_;
    	    };
    	    SetHashBuckets.prototype.find = function (val) {
    	        var e_1, _a;
    	        var index = this.hash_function()(val) % this.length();
    	        var bucket = this.at(index);
    	        try {
    	            for (var bucket_1 = __values(bucket), bucket_1_1 = bucket_1.next(); !bucket_1_1.done; bucket_1_1 = bucket_1.next()) {
    	                var it = bucket_1_1.value;
    	                if (this.key_eq_(it.value, val))
    	                    return it;
    	            }
    	        }
    	        catch (e_1_1) { e_1 = { error: e_1_1 }; }
    	        finally {
    	            try {
    	                if (bucket_1_1 && !bucket_1_1.done && (_a = bucket_1.return)) _a.call(bucket_1);
    	            }
    	            finally { if (e_1) throw e_1.error; }
    	        }
    	        return this.source_.end();
    	    };
    	    return SetHashBuckets;
    	}(HashBuckets_1.HashBuckets));
    	SetHashBuckets.SetHashBuckets = SetHashBuckets$1;
    	function fetcher(elem) {
    	    return elem.value;
    	}
    	
    	return SetHashBuckets;
    }

    var Pair = {};

    var hasRequiredPair;

    function requirePair () {
    	if (hasRequiredPair) return Pair;
    	hasRequiredPair = 1;
    	Object.defineProperty(Pair, "__esModule", { value: true });
    	Pair.make_pair = Pair.Pair = void 0;
    	var hash_1 = requireHash();
    	var comparators_1 = requireComparators();
    	/**
    	 * Pair of two elements.
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var Pair$1 = /** @class */ (function () {
    	    /* ---------------------------------------------------------
    	        CONSTRUCTORS
    	    --------------------------------------------------------- */
    	    /**
    	     * Initializer Constructor.
    	     *
    	     * @param first The first element.
    	     * @param second The second element.
    	     */
    	    function Pair(first, second) {
    	        this.first = first;
    	        this.second = second;
    	    }
    	    /* ---------------------------------------------------------
    	        COMPARISON
    	    --------------------------------------------------------- */
    	    /**
    	     * @inheritDoc
    	     */
    	    Pair.prototype.equals = function (pair) {
    	        return ((0, comparators_1.equal_to)(this.first, pair.first) &&
    	            (0, comparators_1.equal_to)(this.second, pair.second));
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    Pair.prototype.less = function (pair) {
    	        if ((0, comparators_1.equal_to)(this.first, pair.first) === false)
    	            return (0, comparators_1.less)(this.first, pair.first);
    	        else
    	            return (0, comparators_1.less)(this.second, pair.second);
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    Pair.prototype.hashCode = function () {
    	        return (0, hash_1.hash)(this.first, this.second);
    	    };
    	    return Pair;
    	}());
    	Pair.Pair = Pair$1;
    	/**
    	 * Create a {@link Pair}.
    	 *
    	 * @param first The 1st element.
    	 * @param second The 2nd element.
    	 *
    	 * @return A {@link Pair} object.
    	 */
    	function make_pair(first, second) {
    	    return new Pair$1(first, second);
    	}
    	Pair.make_pair = make_pair;
    	
    	return Pair;
    }

    var hasRequiredHashSet;

    function requireHashSet () {
    	if (hasRequiredHashSet) return HashSet;
    	hasRequiredHashSet = 1;
    	(function (exports) {
    		var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    		    var extendStatics = function (d, b) {
    		        extendStatics = Object.setPrototypeOf ||
    		            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    		            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    		        return extendStatics(d, b);
    		    };
    		    return function (d, b) {
    		        if (typeof b !== "function" && b !== null)
    		            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    		        extendStatics(d, b);
    		        function __() { this.constructor = d; }
    		        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    		    };
    		})();
    		var __read = (commonjsGlobal && commonjsGlobal.__read) || function (o, n) {
    		    var m = typeof Symbol === "function" && o[Symbol.iterator];
    		    if (!m) return o;
    		    var i = m.call(o), r, ar = [], e;
    		    try {
    		        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    		    }
    		    catch (error) { e = { error: error }; }
    		    finally {
    		        try {
    		            if (r && !r.done && (m = i["return"])) m.call(i);
    		        }
    		        finally { if (e) throw e.error; }
    		    }
    		    return ar;
    		};
    		var __spreadArray = (commonjsGlobal && commonjsGlobal.__spreadArray) || function (to, from, pack) {
    		    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    		        if (ar || !(i in from)) {
    		            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
    		            ar[i] = from[i];
    		        }
    		    }
    		    return to.concat(ar || Array.prototype.slice.call(from));
    		};
    		Object.defineProperty(exports, "__esModule", { value: true });
    		exports.HashSet = void 0;
    		//================================================================
    		/**
    		 * @packageDocumentation
    		 * @module std
    		 */
    		//================================================================
    		var UniqueSet_1 = requireUniqueSet();
    		var IHashContainer_1 = requireIHashContainer();
    		var SetElementList_1 = requireSetElementList();
    		var SetHashBuckets_1 = requireSetHashBuckets();
    		var Pair_1 = requirePair();
    		/**
    		 * Unique-key Set based on Hash buckets.
    		 *
    		 * @author Jeongho Nam - https://github.com/samchon
    		 */
    		var HashSet = /** @class */ (function (_super) {
    		    __extends(HashSet, _super);
    		    function HashSet() {
    		        var args = [];
    		        for (var _i = 0; _i < arguments.length; _i++) {
    		            args[_i] = arguments[_i];
    		        }
    		        var _this = _super.call(this, function (thisArg) { return new SetElementList_1.SetElementList(thisArg); }) || this;
    		        IHashContainer_1.IHashContainer.construct.apply(IHashContainer_1.IHashContainer, __spreadArray([_this,
    		            HashSet,
    		            function (hash, pred) {
    		                _this.buckets_ = new SetHashBuckets_1.SetHashBuckets(_this, hash, pred);
    		            }], __read(args), false));
    		        return _this;
    		    }
    		    /* ---------------------------------------------------------
    		        ASSIGN & CLEAR
    		    --------------------------------------------------------- */
    		    /**
    		     * @inheritDoc
    		     */
    		    HashSet.prototype.clear = function () {
    		        this.buckets_.clear();
    		        _super.prototype.clear.call(this);
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashSet.prototype.swap = function (obj) {
    		        var _a, _b;
    		        // SWAP CONTENTS
    		        _a = __read([obj.data_, this.data_], 2), this.data_ = _a[0], obj.data_ = _a[1];
    		        SetElementList_1.SetElementList._Swap_associative(this.data_, obj.data_);
    		        // SWAP BUCKETS
    		        SetHashBuckets_1.SetHashBuckets._Swap_source(this.buckets_, obj.buckets_);
    		        _b = __read([obj.buckets_, this.buckets_], 2), this.buckets_ = _b[0], obj.buckets_ = _b[1];
    		    };
    		    /* =========================================================
    		        ACCESSORS
    		            - MEMBER
    		            - HASH
    		    ============================================================
    		        MEMBER
    		    --------------------------------------------------------- */
    		    /**
    		     * @inheritDoc
    		     */
    		    HashSet.prototype.find = function (key) {
    		        return this.buckets_.find(key);
    		    };
    		    HashSet.prototype.begin = function (index) {
    		        if (index === void 0) { index = null; }
    		        if (index === null)
    		            return _super.prototype.begin.call(this);
    		        else
    		            return this.buckets_.at(index)[0];
    		    };
    		    HashSet.prototype.end = function (index) {
    		        if (index === void 0) { index = null; }
    		        if (index === null)
    		            return _super.prototype.end.call(this);
    		        else {
    		            var bucket = this.buckets_.at(index);
    		            return bucket[bucket.length - 1].next();
    		        }
    		    };
    		    HashSet.prototype.rbegin = function (index) {
    		        if (index === void 0) { index = null; }
    		        return this.end(index).reverse();
    		    };
    		    HashSet.prototype.rend = function (index) {
    		        if (index === void 0) { index = null; }
    		        return this.begin(index).reverse();
    		    };
    		    /* ---------------------------------------------------------
    		        HASH
    		    --------------------------------------------------------- */
    		    /**
    		     * @inheritDoc
    		     */
    		    HashSet.prototype.bucket_count = function () {
    		        return this.buckets_.length();
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashSet.prototype.bucket_size = function (n) {
    		        return this.buckets_.at(n).length;
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashSet.prototype.load_factor = function () {
    		        return this.buckets_.load_factor();
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashSet.prototype.hash_function = function () {
    		        return this.buckets_.hash_function();
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashSet.prototype.key_eq = function () {
    		        return this.buckets_.key_eq();
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashSet.prototype.bucket = function (key) {
    		        return this.hash_function()(key) % this.buckets_.length();
    		    };
    		    HashSet.prototype.max_load_factor = function (z) {
    		        if (z === void 0) { z = null; }
    		        return this.buckets_.max_load_factor(z);
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashSet.prototype.reserve = function (n) {
    		        this.buckets_.reserve(n);
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashSet.prototype.rehash = function (n) {
    		        this.buckets_.rehash(n);
    		    };
    		    /* =========================================================
    		        ELEMENTS I/O
    		            - INSERT
    		            - POST-PROCESS
    		            - SWAP
    		    ============================================================
    		        INSERT
    		    --------------------------------------------------------- */
    		    HashSet.prototype._Insert_by_key = function (key) {
    		        // TEST WHETHER EXIST
    		        var it = this.find(key);
    		        if (it.equals(this.end()) === false)
    		            return new Pair_1.Pair(it, false);
    		        // INSERT
    		        this.data_.push(key);
    		        it = it.prev();
    		        // POST-PROCESS
    		        this._Handle_insert(it, it.next());
    		        return new Pair_1.Pair(it, true);
    		    };
    		    HashSet.prototype._Insert_by_hint = function (hint, key) {
    		        // FIND DUPLICATED KEY
    		        var it = this.find(key);
    		        if (it.equals(this.end()) === true) {
    		            // INSERT
    		            it = this.data_.insert(hint, key);
    		            // POST-PROCESS
    		            this._Handle_insert(it, it.next());
    		        }
    		        return it;
    		    };
    		    /* ---------------------------------------------------------
    		        POST-PROCESS
    		    --------------------------------------------------------- */
    		    HashSet.prototype._Handle_insert = function (first, last) {
    		        for (; !first.equals(last); first = first.next())
    		            this.buckets_.insert(first);
    		    };
    		    HashSet.prototype._Handle_erase = function (first, last) {
    		        for (; !first.equals(last); first = first.next())
    		            this.buckets_.erase(first);
    		    };
    		    return HashSet;
    		}(UniqueSet_1.UniqueSet));
    		exports.HashSet = HashSet;
    		/**
    		 *
    		 */
    		(function (HashSet) {
    		    // BODY
    		    HashSet.Iterator = SetElementList_1.SetElementList.Iterator;
    		    HashSet.ReverseIterator = SetElementList_1.SetElementList.ReverseIterator;
    		})(HashSet = exports.HashSet || (exports.HashSet = {}));
    		exports.HashSet = HashSet;
    		
    } (HashSet));
    	return HashSet;
    }

    var HashMap = {};

    var UniqueMap = {};

    var MapContainer = {};

    var hasRequiredMapContainer;

    function requireMapContainer () {
    	if (hasRequiredMapContainer) return MapContainer;
    	hasRequiredMapContainer = 1;
    	var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    	    var extendStatics = function (d, b) {
    	        extendStatics = Object.setPrototypeOf ||
    	            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    	            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    	        return extendStatics(d, b);
    	    };
    	    return function (d, b) {
    	        if (typeof b !== "function" && b !== null)
    	            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    	        extendStatics(d, b);
    	        function __() { this.constructor = d; }
    	        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    	    };
    	})();
    	Object.defineProperty(MapContainer, "__esModule", { value: true });
    	MapContainer.MapContainer = void 0;
    	var Container_1 = requireContainer();
    	var NativeArrayIterator_1 = requireNativeArrayIterator();
    	/**
    	 * Basic map container.
    	 *
    	 * @template Key Key type
    	 * @template T Mapped type
    	 * @template Unique Whether duplicated key is blocked or not
    	 * @template Source Derived type extending this {@link MapContainer}
    	 * @template IteratorT Iterator type
    	 * @template ReverseT Reverse iterator type
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var MapContainer$1 = /** @class */ (function (_super) {
    	    __extends(MapContainer, _super);
    	    /* ---------------------------------------------------------
    	        CONSTURCTORS
    	    --------------------------------------------------------- */
    	    /**
    	     * Default Constructor.
    	     */
    	    function MapContainer(factory) {
    	        var _this = _super.call(this) || this;
    	        _this.data_ = factory(_this);
    	        return _this;
    	    }
    	    /**
    	     * @inheritDoc
    	     */
    	    MapContainer.prototype.assign = function (first, last) {
    	        // INSERT
    	        this.clear();
    	        this.insert(first, last);
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    MapContainer.prototype.clear = function () {
    	        // TO BE ABSTRACT
    	        this.data_.clear();
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    MapContainer.prototype.begin = function () {
    	        return this.data_.begin();
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    MapContainer.prototype.end = function () {
    	        return this.data_.end();
    	    };
    	    /* ---------------------------------------------------------
    	        ELEMENTS
    	    --------------------------------------------------------- */
    	    /**
    	     * @inheritDoc
    	     */
    	    MapContainer.prototype.has = function (key) {
    	        return !this.find(key).equals(this.end());
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    MapContainer.prototype.size = function () {
    	        return this.data_.size();
    	    };
    	    /* =========================================================
    	        ELEMENTS I/O
    	            - INSERT
    	            - ERASE
    	            - UTILITY
    	            - POST-PROCESS
    	    ============================================================
    	        INSERT
    	    --------------------------------------------------------- */
    	    /**
    	     * @inheritDoc
    	     */
    	    MapContainer.prototype.push = function () {
    	        var items = [];
    	        for (var _i = 0; _i < arguments.length; _i++) {
    	            items[_i] = arguments[_i];
    	        }
    	        // INSERT BY RANGE
    	        var first = new NativeArrayIterator_1.NativeArrayIterator(items, 0);
    	        var last = new NativeArrayIterator_1.NativeArrayIterator(items, items.length);
    	        this.insert(first, last);
    	        // RETURN SIZE
    	        return this.size();
    	    };
    	    MapContainer.prototype.insert = function () {
    	        var args = [];
    	        for (var _i = 0; _i < arguments.length; _i++) {
    	            args[_i] = arguments[_i];
    	        }
    	        if (args.length === 1)
    	            return this.emplace(args[0].first, args[0].second);
    	        else if (args[0].next instanceof Function &&
    	            args[1].next instanceof Function)
    	            return this._Insert_by_range(args[0], args[1]);
    	        else
    	            return this.emplace_hint(args[0], args[1].first, args[1].second);
    	    };
    	    MapContainer.prototype.erase = function () {
    	        var args = [];
    	        for (var _i = 0; _i < arguments.length; _i++) {
    	            args[_i] = arguments[_i];
    	        }
    	        if (args.length === 1 &&
    	            (args[0] instanceof this.end().constructor === false ||
    	                args[0].source() !== this))
    	            return this._Erase_by_key(args[0]);
    	        else if (args.length === 1)
    	            return this._Erase_by_range(args[0]);
    	        else
    	            return this._Erase_by_range(args[0], args[1]);
    	    };
    	    MapContainer.prototype._Erase_by_range = function (first, last) {
    	        if (last === void 0) { last = first.next(); }
    	        // ERASE
    	        var it = this.data_.erase(first, last);
    	        // POST-PROCESS
    	        this._Handle_erase(first, last);
    	        return it;
    	    };
    	    return MapContainer;
    	}(Container_1.Container));
    	MapContainer.MapContainer = MapContainer$1;
    	
    	return MapContainer;
    }

    var hasRequiredUniqueMap;

    function requireUniqueMap () {
    	if (hasRequiredUniqueMap) return UniqueMap;
    	hasRequiredUniqueMap = 1;
    	var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    	    var extendStatics = function (d, b) {
    	        extendStatics = Object.setPrototypeOf ||
    	            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    	            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    	        return extendStatics(d, b);
    	    };
    	    return function (d, b) {
    	        if (typeof b !== "function" && b !== null)
    	            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    	        extendStatics(d, b);
    	        function __() { this.constructor = d; }
    	        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    	    };
    	})();
    	var __read = (commonjsGlobal && commonjsGlobal.__read) || function (o, n) {
    	    var m = typeof Symbol === "function" && o[Symbol.iterator];
    	    if (!m) return o;
    	    var i = m.call(o), r, ar = [], e;
    	    try {
    	        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    	    }
    	    catch (error) { e = { error: error }; }
    	    finally {
    	        try {
    	            if (r && !r.done && (m = i["return"])) m.call(i);
    	        }
    	        finally { if (e) throw e.error; }
    	    }
    	    return ar;
    	};
    	var __spreadArray = (commonjsGlobal && commonjsGlobal.__spreadArray) || function (to, from, pack) {
    	    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    	        if (ar || !(i in from)) {
    	            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
    	            ar[i] = from[i];
    	        }
    	    }
    	    return to.concat(ar || Array.prototype.slice.call(from));
    	};
    	Object.defineProperty(UniqueMap, "__esModule", { value: true });
    	UniqueMap.UniqueMap = void 0;
    	//================================================================
    	/**
    	 * @packageDocumentation
    	 * @module std.base
    	 */
    	//================================================================
    	var MapContainer_1 = requireMapContainer();
    	var ErrorGenerator_1 = requireErrorGenerator();
    	/**
    	 * Basic map container blocking duplicated key.
    	 *
    	 * @template Key Key type
    	 * @template T Mapped type
    	 * @template Source Derived type extending this {@link UniqueMap}
    	 * @template IteratorT Iterator type
    	 * @template ReverseT Reverse iterator type
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var UniqueMap$1 = /** @class */ (function (_super) {
    	    __extends(UniqueMap, _super);
    	    function UniqueMap() {
    	        return _super !== null && _super.apply(this, arguments) || this;
    	    }
    	    /* ---------------------------------------------------------
    	        ACCESSORS
    	    --------------------------------------------------------- */
    	    /**
    	     * @inheritDoc
    	     */
    	    UniqueMap.prototype.count = function (key) {
    	        return this.find(key).equals(this.end()) ? 0 : 1;
    	    };
    	    /**
    	     * Get a value.
    	     *
    	     * @param key Key to search for.
    	     * @return The value mapped by the key.
    	     */
    	    UniqueMap.prototype.get = function (key) {
    	        var it = this.find(key);
    	        if (it.equals(this.end()) === true)
    	            throw ErrorGenerator_1.ErrorGenerator.key_nout_found(this, "get", key);
    	        return it.second;
    	    };
    	    /**
    	     * Take a value.
    	     *
    	     * Get a value, or set the value and returns it.
    	     *
    	     * @param key Key to search for.
    	     * @param generator Value generator when the matched key not found
    	     * @returns Value, anyway
    	     */
    	    UniqueMap.prototype.take = function (key, generator) {
    	        var it = this.find(key);
    	        return it.equals(this.end())
    	            ? this.emplace(key, generator()).first.second
    	            : it.second;
    	    };
    	    /**
    	     * Set a value with key.
    	     *
    	     * @param key Key to be mapped or search for.
    	     * @param val Value to insert or assign.
    	     */
    	    UniqueMap.prototype.set = function (key, val) {
    	        this.insert_or_assign(key, val);
    	    };
    	    UniqueMap.prototype.insert = function () {
    	        var args = [];
    	        for (var _i = 0; _i < arguments.length; _i++) {
    	            args[_i] = arguments[_i];
    	        }
    	        return _super.prototype.insert.apply(this, __spreadArray([], __read(args), false));
    	    };
    	    UniqueMap.prototype._Insert_by_range = function (first, last) {
    	        for (var it = first; !it.equals(last); it = it.next())
    	            this.emplace(it.value.first, it.value.second);
    	    };
    	    UniqueMap.prototype.insert_or_assign = function () {
    	        var args = [];
    	        for (var _i = 0; _i < arguments.length; _i++) {
    	            args[_i] = arguments[_i];
    	        }
    	        if (args.length === 2) {
    	            return this._Insert_or_assign_with_key_value(args[0], args[1]);
    	        }
    	        else if (args.length === 3) {
    	            // INSERT OR ASSIGN AN ELEMENT
    	            return this._Insert_or_assign_with_hint(args[0], args[1], args[2]);
    	        }
    	    };
    	    UniqueMap.prototype._Insert_or_assign_with_key_value = function (key, value) {
    	        var ret = this.emplace(key, value);
    	        if (ret.second === false)
    	            ret.first.second = value;
    	        return ret;
    	    };
    	    UniqueMap.prototype._Insert_or_assign_with_hint = function (hint, key, value) {
    	        var ret = this.emplace_hint(hint, key, value);
    	        if (ret.second !== value)
    	            ret.second = value;
    	        return ret;
    	    };
    	    UniqueMap.prototype.extract = function (param) {
    	        if (param instanceof this.end().constructor)
    	            return this._Extract_by_iterator(param);
    	        else
    	            return this._Extract_by_key(param);
    	    };
    	    UniqueMap.prototype._Extract_by_key = function (key) {
    	        var it = this.find(key);
    	        if (it.equals(this.end()) === true)
    	            throw ErrorGenerator_1.ErrorGenerator.key_nout_found(this, "extract", key);
    	        var ret = it.value;
    	        this._Erase_by_range(it);
    	        return ret;
    	    };
    	    UniqueMap.prototype._Extract_by_iterator = function (it) {
    	        if (it.equals(this.end()) === true)
    	            return this.end();
    	        this._Erase_by_range(it);
    	        return it;
    	    };
    	    UniqueMap.prototype._Erase_by_key = function (key) {
    	        var it = this.find(key);
    	        if (it.equals(this.end()) === true)
    	            return 0;
    	        this._Erase_by_range(it);
    	        return 1;
    	    };
    	    /* ---------------------------------------------------------
    	        UTILITY
    	    --------------------------------------------------------- */
    	    /**
    	     * @inheritDoc
    	     */
    	    UniqueMap.prototype.merge = function (source) {
    	        for (var it = source.begin(); !it.equals(source.end());)
    	            if (this.has(it.first) === false) {
    	                this.insert(it.value);
    	                it = source.erase(it);
    	            }
    	            else
    	                it = it.next();
    	    };
    	    return UniqueMap;
    	}(MapContainer_1.MapContainer));
    	UniqueMap.UniqueMap = UniqueMap$1;
    	
    	return UniqueMap;
    }

    var MapElementList = {};

    var hasRequiredMapElementList;

    function requireMapElementList () {
    	if (hasRequiredMapElementList) return MapElementList;
    	hasRequiredMapElementList = 1;
    	(function (exports) {
    		var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    		    var extendStatics = function (d, b) {
    		        extendStatics = Object.setPrototypeOf ||
    		            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    		            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    		        return extendStatics(d, b);
    		    };
    		    return function (d, b) {
    		        if (typeof b !== "function" && b !== null)
    		            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    		        extendStatics(d, b);
    		        function __() { this.constructor = d; }
    		        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    		    };
    		})();
    		var __read = (commonjsGlobal && commonjsGlobal.__read) || function (o, n) {
    		    var m = typeof Symbol === "function" && o[Symbol.iterator];
    		    if (!m) return o;
    		    var i = m.call(o), r, ar = [], e;
    		    try {
    		        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    		    }
    		    catch (error) { e = { error: error }; }
    		    finally {
    		        try {
    		            if (r && !r.done && (m = i["return"])) m.call(i);
    		        }
    		        finally { if (e) throw e.error; }
    		    }
    		    return ar;
    		};
    		Object.defineProperty(exports, "__esModule", { value: true });
    		exports.MapElementList = void 0;
    		//================================================================
    		/**
    		 * @packageDocumentation
    		 * @module std.internal
    		 */
    		//================================================================
    		var ListContainer_1 = requireListContainer();
    		var ListIterator_1 = requireListIterator();
    		var ReverseIterator_1 = requireReverseIterator();
    		/**
    		 * Doubly Linked List storing map elements.
    		 *
    		 * @template Key Key type
    		 * @template T Mapped type
    		 * @template Unique Whether duplicated key is blocked or not
    		 * @template Source Source type
    		 *
    		 * @author Jeongho Nam - https://github.com/samchon
    		 */
    		var MapElementList = /** @class */ (function (_super) {
    		    __extends(MapElementList, _super);
    		    /* ---------------------------------------------------------
    		        CONSTRUCTORS
    		    --------------------------------------------------------- */
    		    function MapElementList(associative) {
    		        var _this = _super.call(this) || this;
    		        _this.associative_ = associative;
    		        return _this;
    		    }
    		    MapElementList.prototype._Create_iterator = function (prev, next, val) {
    		        return MapElementList.Iterator.create(this, prev, next, val);
    		    };
    		    /**
    		     * @internal
    		     */
    		    MapElementList._Swap_associative = function (x, y) {
    		        var _a;
    		        _a = __read([y.associative_, x.associative_], 2), x.associative_ = _a[0], y.associative_ = _a[1];
    		    };
    		    /* ---------------------------------------------------------
    		        ACCESSORS
    		    --------------------------------------------------------- */
    		    MapElementList.prototype.associative = function () {
    		        return this.associative_;
    		    };
    		    return MapElementList;
    		}(ListContainer_1.ListContainer));
    		exports.MapElementList = MapElementList;
    		/**
    		 *
    		 */
    		(function (MapElementList) {
    		    /**
    		     * Iterator of map container storing elements in a list.
    		     *
    		     * @template Key Key type
    		     * @template T Mapped type
    		     * @template Unique Whether duplicated key is blocked or not
    		     * @template Source Source container type
    		     *
    		     * @author Jeongho Nam - https://github.com/samchon
    		     */
    		    var Iterator = /** @class */ (function (_super) {
    		        __extends(Iterator, _super);
    		        /* ---------------------------------------------------------
    		            CONSTRUCTORS
    		        --------------------------------------------------------- */
    		        function Iterator(list, prev, next, val) {
    		            var _this = _super.call(this, prev, next, val) || this;
    		            _this.list_ = list;
    		            return _this;
    		        }
    		        /**
    		         * @internal
    		         */
    		        Iterator.create = function (list, prev, next, val) {
    		            return new Iterator(list, prev, next, val);
    		        };
    		        /**
    		         * @inheritDoc
    		         */
    		        Iterator.prototype.reverse = function () {
    		            return new ReverseIterator(this);
    		        };
    		        /* ---------------------------------------------------------
    		            ACCESSORS
    		        --------------------------------------------------------- */
    		        /**
    		         * @inheritDoc
    		         */
    		        Iterator.prototype.source = function () {
    		            return this.list_.associative();
    		        };
    		        Object.defineProperty(Iterator.prototype, "first", {
    		            /**
    		             * @inheritDoc
    		             */
    		            get: function () {
    		                return this.value.first;
    		            },
    		            enumerable: false,
    		            configurable: true
    		        });
    		        Object.defineProperty(Iterator.prototype, "second", {
    		            /**
    		             * @inheritDoc
    		             */
    		            get: function () {
    		                return this.value.second;
    		            },
    		            /**
    		             * @inheritDoc
    		             */
    		            set: function (val) {
    		                this.value.second = val;
    		            },
    		            enumerable: false,
    		            configurable: true
    		        });
    		        return Iterator;
    		    }(ListIterator_1.ListIterator));
    		    MapElementList.Iterator = Iterator;
    		    /**
    		     * Reverse iterator of map container storing elements a list.
    		     *
    		     * @template Key Key type
    		     * @template T Mapped type
    		     * @template Unique Whether duplicated key is blocked or not
    		     * @template Source Source container type
    		     *
    		     * @author Jeongho Nam - https://github.com/samchon
    		     */
    		    var ReverseIterator = /** @class */ (function (_super) {
    		        __extends(ReverseIterator, _super);
    		        function ReverseIterator() {
    		            return _super !== null && _super.apply(this, arguments) || this;
    		        }
    		        /* ---------------------------------------------------------
    		            CONSTRUCTORS
    		        --------------------------------------------------------- */
    		        ReverseIterator.prototype._Create_neighbor = function (base) {
    		            return new ReverseIterator(base);
    		        };
    		        Object.defineProperty(ReverseIterator.prototype, "first", {
    		            /* ---------------------------------------------------------
    		                ACCESSORS
    		            --------------------------------------------------------- */
    		            /**
    		             * Get the first, key element.
    		             *
    		             * @return The first element.
    		             */
    		            get: function () {
    		                return this.base_.first;
    		            },
    		            enumerable: false,
    		            configurable: true
    		        });
    		        Object.defineProperty(ReverseIterator.prototype, "second", {
    		            /**
    		             * Get the second, stored element.
    		             *
    		             * @return The second element.
    		             */
    		            get: function () {
    		                return this.base_.second;
    		            },
    		            /**
    		             * Set the second, stored element.
    		             *
    		             * @param val The value to set.
    		             */
    		            set: function (val) {
    		                this.base_.second = val;
    		            },
    		            enumerable: false,
    		            configurable: true
    		        });
    		        return ReverseIterator;
    		    }(ReverseIterator_1.ReverseIterator));
    		    MapElementList.ReverseIterator = ReverseIterator;
    		})(MapElementList = exports.MapElementList || (exports.MapElementList = {}));
    		exports.MapElementList = MapElementList;
    		
    } (MapElementList));
    	return MapElementList;
    }

    var MapHashBuckets = {};

    var hasRequiredMapHashBuckets;

    function requireMapHashBuckets () {
    	if (hasRequiredMapHashBuckets) return MapHashBuckets;
    	hasRequiredMapHashBuckets = 1;
    	var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    	    var extendStatics = function (d, b) {
    	        extendStatics = Object.setPrototypeOf ||
    	            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    	            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    	        return extendStatics(d, b);
    	    };
    	    return function (d, b) {
    	        if (typeof b !== "function" && b !== null)
    	            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    	        extendStatics(d, b);
    	        function __() { this.constructor = d; }
    	        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    	    };
    	})();
    	var __read = (commonjsGlobal && commonjsGlobal.__read) || function (o, n) {
    	    var m = typeof Symbol === "function" && o[Symbol.iterator];
    	    if (!m) return o;
    	    var i = m.call(o), r, ar = [], e;
    	    try {
    	        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    	    }
    	    catch (error) { e = { error: error }; }
    	    finally {
    	        try {
    	            if (r && !r.done && (m = i["return"])) m.call(i);
    	        }
    	        finally { if (e) throw e.error; }
    	    }
    	    return ar;
    	};
    	var __values = (commonjsGlobal && commonjsGlobal.__values) || function(o) {
    	    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    	    if (m) return m.call(o);
    	    if (o && typeof o.length === "number") return {
    	        next: function () {
    	            if (o && i >= o.length) o = void 0;
    	            return { value: o && o[i++], done: !o };
    	        }
    	    };
    	    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    	};
    	Object.defineProperty(MapHashBuckets, "__esModule", { value: true });
    	MapHashBuckets.MapHashBuckets = void 0;
    	//================================================================
    	/**
    	 * @packageDocumentation
    	 * @module std.internal
    	 */
    	//================================================================
    	var HashBuckets_1 = requireHashBuckets();
    	/**
    	 * Hash buckets for map containers.
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var MapHashBuckets$1 = /** @class */ (function (_super) {
    	    __extends(MapHashBuckets, _super);
    	    /* ---------------------------------------------------------
    	        CONSTRUCTORS
    	    --------------------------------------------------------- */
    	    /**
    	     * Initializer Constructor
    	     *
    	     * @param source Source map container
    	     * @param hasher Hash function
    	     * @param pred Equality function
    	     */
    	    function MapHashBuckets(source, hasher, pred) {
    	        var _this = _super.call(this, fetcher, hasher) || this;
    	        _this.source_ = source;
    	        _this.key_eq_ = pred;
    	        return _this;
    	    }
    	    /**
    	     * @internal
    	     */
    	    MapHashBuckets._Swap_source = function (x, y) {
    	        var _a;
    	        _a = __read([y.source_, x.source_], 2), x.source_ = _a[0], y.source_ = _a[1];
    	    };
    	    /* ---------------------------------------------------------
    	        FINDERS
    	    --------------------------------------------------------- */
    	    MapHashBuckets.prototype.key_eq = function () {
    	        return this.key_eq_;
    	    };
    	    MapHashBuckets.prototype.find = function (key) {
    	        var e_1, _a;
    	        var index = this.hash_function()(key) % this.length();
    	        var bucket = this.at(index);
    	        try {
    	            for (var bucket_1 = __values(bucket), bucket_1_1 = bucket_1.next(); !bucket_1_1.done; bucket_1_1 = bucket_1.next()) {
    	                var it = bucket_1_1.value;
    	                if (this.key_eq_(it.first, key))
    	                    return it;
    	            }
    	        }
    	        catch (e_1_1) { e_1 = { error: e_1_1 }; }
    	        finally {
    	            try {
    	                if (bucket_1_1 && !bucket_1_1.done && (_a = bucket_1.return)) _a.call(bucket_1);
    	            }
    	            finally { if (e_1) throw e_1.error; }
    	        }
    	        return this.source_.end();
    	    };
    	    return MapHashBuckets;
    	}(HashBuckets_1.HashBuckets));
    	MapHashBuckets.MapHashBuckets = MapHashBuckets$1;
    	function fetcher(elem) {
    	    return elem.first;
    	}
    	
    	return MapHashBuckets;
    }

    var Entry = {};

    var hasRequiredEntry;

    function requireEntry () {
    	if (hasRequiredEntry) return Entry;
    	hasRequiredEntry = 1;
    	Object.defineProperty(Entry, "__esModule", { value: true });
    	Entry.Entry = void 0;
    	var hash_1 = requireHash();
    	var comparators_1 = requireComparators();
    	/**
    	 * Entry for mapping.
    	 *
    	 * @author Jeongho Nam - https://github.com/samchon
    	 */
    	var Entry$1 = /** @class */ (function () {
    	    /**
    	     * Intializer Constructor.
    	     *
    	     * @param first The first, key element.
    	     * @param second The second, mapped element.
    	     */
    	    function Entry(first, second) {
    	        this.first = first;
    	        this.second = second;
    	    }
    	    /**
    	     * @inheritDoc
    	     */
    	    Entry.prototype.equals = function (obj) {
    	        return (0, comparators_1.equal_to)(this.first, obj.first);
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    Entry.prototype.less = function (obj) {
    	        return (0, comparators_1.less)(this.first, obj.first);
    	    };
    	    /**
    	     * @inheritDoc
    	     */
    	    Entry.prototype.hashCode = function () {
    	        return (0, hash_1.hash)(this.first);
    	    };
    	    return Entry;
    	}());
    	Entry.Entry = Entry$1;
    	
    	return Entry;
    }

    var hasRequiredHashMap;

    function requireHashMap () {
    	if (hasRequiredHashMap) return HashMap;
    	hasRequiredHashMap = 1;
    	(function (exports) {
    		var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    		    var extendStatics = function (d, b) {
    		        extendStatics = Object.setPrototypeOf ||
    		            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    		            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    		        return extendStatics(d, b);
    		    };
    		    return function (d, b) {
    		        if (typeof b !== "function" && b !== null)
    		            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    		        extendStatics(d, b);
    		        function __() { this.constructor = d; }
    		        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    		    };
    		})();
    		var __read = (commonjsGlobal && commonjsGlobal.__read) || function (o, n) {
    		    var m = typeof Symbol === "function" && o[Symbol.iterator];
    		    if (!m) return o;
    		    var i = m.call(o), r, ar = [], e;
    		    try {
    		        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    		    }
    		    catch (error) { e = { error: error }; }
    		    finally {
    		        try {
    		            if (r && !r.done && (m = i["return"])) m.call(i);
    		        }
    		        finally { if (e) throw e.error; }
    		    }
    		    return ar;
    		};
    		var __spreadArray = (commonjsGlobal && commonjsGlobal.__spreadArray) || function (to, from, pack) {
    		    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    		        if (ar || !(i in from)) {
    		            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
    		            ar[i] = from[i];
    		        }
    		    }
    		    return to.concat(ar || Array.prototype.slice.call(from));
    		};
    		Object.defineProperty(exports, "__esModule", { value: true });
    		exports.HashMap = void 0;
    		//================================================================
    		/**
    		 * @packageDocumentation
    		 * @module std
    		 */
    		//================================================================
    		var UniqueMap_1 = requireUniqueMap();
    		var IHashContainer_1 = requireIHashContainer();
    		var MapElementList_1 = requireMapElementList();
    		var MapHashBuckets_1 = requireMapHashBuckets();
    		var Entry_1 = requireEntry();
    		var Pair_1 = requirePair();
    		/**
    		 * Unique-key Map based on Hash buckets.
    		 *
    		 * @author Jeongho Nam - https://github.com/samchon
    		 */
    		var HashMap = /** @class */ (function (_super) {
    		    __extends(HashMap, _super);
    		    function HashMap() {
    		        var args = [];
    		        for (var _i = 0; _i < arguments.length; _i++) {
    		            args[_i] = arguments[_i];
    		        }
    		        var _this = _super.call(this, function (thisArg) { return new MapElementList_1.MapElementList(thisArg); }) || this;
    		        IHashContainer_1.IHashContainer.construct.apply(IHashContainer_1.IHashContainer, __spreadArray([_this,
    		            HashMap,
    		            function (hash, pred) {
    		                _this.buckets_ = new MapHashBuckets_1.MapHashBuckets(_this, hash, pred);
    		            }], __read(args), false));
    		        return _this;
    		    }
    		    /* ---------------------------------------------------------
    		        ASSIGN & CLEAR
    		    --------------------------------------------------------- */
    		    /**
    		     * @inheritDoc
    		     */
    		    HashMap.prototype.clear = function () {
    		        this.buckets_.clear();
    		        _super.prototype.clear.call(this);
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashMap.prototype.swap = function (obj) {
    		        var _a, _b;
    		        // SWAP CONTENTS
    		        _a = __read([obj.data_, this.data_], 2), this.data_ = _a[0], obj.data_ = _a[1];
    		        MapElementList_1.MapElementList._Swap_associative(this.data_, obj.data_);
    		        // SWAP BUCKETS
    		        MapHashBuckets_1.MapHashBuckets._Swap_source(this.buckets_, obj.buckets_);
    		        _b = __read([obj.buckets_, this.buckets_], 2), this.buckets_ = _b[0], obj.buckets_ = _b[1];
    		    };
    		    /* =========================================================
    		        ACCESSORS
    		            - MEMBER
    		            - HASH
    		    ============================================================
    		        MEMBER
    		    --------------------------------------------------------- */
    		    /**
    		     * @inheritDoc
    		     */
    		    HashMap.prototype.find = function (key) {
    		        return this.buckets_.find(key);
    		    };
    		    HashMap.prototype.begin = function (index) {
    		        if (index === void 0) { index = null; }
    		        if (index === null)
    		            return _super.prototype.begin.call(this);
    		        else
    		            return this.buckets_.at(index)[0];
    		    };
    		    HashMap.prototype.end = function (index) {
    		        if (index === void 0) { index = null; }
    		        if (index === null)
    		            return _super.prototype.end.call(this);
    		        else {
    		            var bucket = this.buckets_.at(index);
    		            return bucket[bucket.length - 1].next();
    		        }
    		    };
    		    HashMap.prototype.rbegin = function (index) {
    		        if (index === void 0) { index = null; }
    		        return this.end(index).reverse();
    		    };
    		    HashMap.prototype.rend = function (index) {
    		        if (index === void 0) { index = null; }
    		        return this.begin(index).reverse();
    		    };
    		    /* ---------------------------------------------------------
    		        HASH
    		    --------------------------------------------------------- */
    		    /**
    		     * @inheritDoc
    		     */
    		    HashMap.prototype.bucket_count = function () {
    		        return this.buckets_.length();
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashMap.prototype.bucket_size = function (index) {
    		        return this.buckets_.at(index).length;
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashMap.prototype.load_factor = function () {
    		        return this.buckets_.load_factor();
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashMap.prototype.hash_function = function () {
    		        return this.buckets_.hash_function();
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashMap.prototype.key_eq = function () {
    		        return this.buckets_.key_eq();
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashMap.prototype.bucket = function (key) {
    		        return this.hash_function()(key) % this.buckets_.length();
    		    };
    		    HashMap.prototype.max_load_factor = function (z) {
    		        if (z === void 0) { z = null; }
    		        return this.buckets_.max_load_factor(z);
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashMap.prototype.reserve = function (n) {
    		        this.buckets_.reserve(n);
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashMap.prototype.rehash = function (n) {
    		        this.buckets_.rehash(n);
    		    };
    		    /* =========================================================
    		        ELEMENTS I/O
    		            - INSERT
    		            - POST-PROCESS
    		    ============================================================
    		        INSERT
    		    --------------------------------------------------------- */
    		    /**
    		     * @inheritDoc
    		     */
    		    HashMap.prototype.emplace = function (key, val) {
    		        // TEST WHETHER EXIST
    		        var it = this.find(key);
    		        if (it.equals(this.end()) === false)
    		            return new Pair_1.Pair(it, false);
    		        // INSERT
    		        this.data_.push(new Entry_1.Entry(key, val));
    		        it = it.prev();
    		        // POST-PROCESS
    		        this._Handle_insert(it, it.next());
    		        return new Pair_1.Pair(it, true);
    		    };
    		    /**
    		     * @inheritDoc
    		     */
    		    HashMap.prototype.emplace_hint = function (hint, key, val) {
    		        // FIND DUPLICATED KEY
    		        var it = this.find(key);
    		        if (it.equals(this.end()) === true) {
    		            // INSERT
    		            it = this.data_.insert(hint, new Entry_1.Entry(key, val));
    		            // POST-PROCESS
    		            this._Handle_insert(it, it.next());
    		        }
    		        return it;
    		    };
    		    /* ---------------------------------------------------------
    		        POST-PROCESS
    		    --------------------------------------------------------- */
    		    HashMap.prototype._Handle_insert = function (first, last) {
    		        for (; !first.equals(last); first = first.next())
    		            this.buckets_.insert(first);
    		    };
    		    HashMap.prototype._Handle_erase = function (first, last) {
    		        for (; !first.equals(last); first = first.next())
    		            this.buckets_.erase(first);
    		    };
    		    return HashMap;
    		}(UniqueMap_1.UniqueMap));
    		exports.HashMap = HashMap;
    		/**
    		 *
    		 */
    		(function (HashMap) {
    		    // BODY
    		    HashMap.Iterator = MapElementList_1.MapElementList.Iterator;
    		    HashMap.ReverseIterator = MapElementList_1.MapElementList.ReverseIterator;
    		})(HashMap = exports.HashMap || (exports.HashMap = {}));
    		exports.HashMap = HashMap;
    		
    } (HashMap));
    	return HashMap;
    }

    var hasRequiredEventTarget;

    function requireEventTarget () {
    	if (hasRequiredEventTarget) return EventTarget;
    	hasRequiredEventTarget = 1;
    	var __values = (commonjsGlobal && commonjsGlobal.__values) || function (o) {
    	    var m = typeof Symbol === "function" && o[Symbol.iterator], i = 0;
    	    if (m) return m.call(o);
    	    return {
    	        next: function () {
    	            if (o && i >= o.length) o = void 0;
    	            return { value: o && o[i++], done: !o };
    	        }
    	    };
    	};
    	Object.defineProperty(EventTarget, "__esModule", { value: true });
    	var HashSet_1 = requireHashSet();
    	var HashMap_1 = requireHashMap();
    	var EventTarget$1 = /** @class */ (function () {
    	    function EventTarget() {
    	        this.listeners_ = new HashMap_1.HashMap();
    	        this.created_at_ = new Date();
    	    }
    	    EventTarget.prototype.dispatchEvent = function (event) {
    	        var e_1, _a;
    	        // FIND LISTENERS
    	        var it = this.listeners_.find(event.type);
    	        if (it.equals(this.listeners_.end()))
    	            return;
    	        // SET DEFAULT ARGUMENTS
    	        event.target = this;
    	        event.timeStamp = new Date().getTime() - this.created_at_.getTime();
    	        try {
    	            // CALL THE LISTENERS
    	            for (var _b = __values(it.second), _c = _b.next(); !_c.done; _c = _b.next()) {
    	                var listener = _c.value;
    	                listener(event);
    	            }
    	        }
    	        catch (e_1_1) { e_1 = { error: e_1_1 }; }
    	        finally {
    	            try {
    	                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
    	            }
    	            finally { if (e_1) throw e_1.error; }
    	        }
    	    };
    	    EventTarget.prototype.addEventListener = function (type, listener) {
    	        var it = this.listeners_.find(type);
    	        if (it.equals(this.listeners_.end()))
    	            it = this.listeners_.emplace(type, new HashSet_1.HashSet()).first;
    	        it.second.insert(listener);
    	    };
    	    EventTarget.prototype.removeEventListener = function (type, listener) {
    	        var it = this.listeners_.find(type);
    	        if (it.equals(this.listeners_.end()))
    	            return;
    	        it.second.erase(listener);
    	        if (it.second.empty())
    	            this.listeners_.erase(it);
    	    };
    	    return EventTarget;
    	}());
    	EventTarget.EventTarget = EventTarget$1;
    	
    	return EventTarget;
    }

    var Event = {};

    var hasRequiredEvent;

    function requireEvent () {
    	if (hasRequiredEvent) return Event;
    	hasRequiredEvent = 1;
    	Object.defineProperty(Event, "__esModule", { value: true });
    	var Event$1 = /** @class */ (function () {
    	    function Event(type, init) {
    	        this.type = type;
    	        if (init)
    	            Object.assign(this, init);
    	    }
    	    return Event;
    	}());
    	Event.Event = Event$1;
    	
    	return Event;
    }

    var CloseEvent = {};

    var hasRequiredCloseEvent;

    function requireCloseEvent () {
    	if (hasRequiredCloseEvent) return CloseEvent;
    	hasRequiredCloseEvent = 1;
    	var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    	    var extendStatics = function (d, b) {
    	        extendStatics = Object.setPrototypeOf ||
    	            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    	            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    	        return extendStatics(d, b);
    	    };
    	    return function (d, b) {
    	        extendStatics(d, b);
    	        function __() { this.constructor = d; }
    	        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    	    };
    	})();
    	Object.defineProperty(CloseEvent, "__esModule", { value: true });
    	var Event_1 = requireEvent();
    	var CloseEvent$1 = /** @class */ (function (_super) {
    	    __extends(CloseEvent, _super);
    	    function CloseEvent(type, init) {
    	        return _super.call(this, type, init) || this;
    	    }
    	    return CloseEvent;
    	}(Event_1.Event));
    	CloseEvent.CloseEvent = CloseEvent$1;
    	
    	return CloseEvent;
    }

    var MessageEvent = {};

    var hasRequiredMessageEvent;

    function requireMessageEvent () {
    	if (hasRequiredMessageEvent) return MessageEvent;
    	hasRequiredMessageEvent = 1;
    	var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    	    var extendStatics = function (d, b) {
    	        extendStatics = Object.setPrototypeOf ||
    	            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    	            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    	        return extendStatics(d, b);
    	    };
    	    return function (d, b) {
    	        extendStatics(d, b);
    	        function __() { this.constructor = d; }
    	        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    	    };
    	})();
    	Object.defineProperty(MessageEvent, "__esModule", { value: true });
    	var Event_1 = requireEvent();
    	var MessageEvent$1 = /** @class */ (function (_super) {
    	    __extends(MessageEvent, _super);
    	    function MessageEvent(type, init) {
    	        return _super.call(this, type, init) || this;
    	    }
    	    return MessageEvent;
    	}(Event_1.Event));
    	MessageEvent.MessageEvent = MessageEvent$1;
    	
    	return MessageEvent;
    }

    var ErrorEvent = {};

    var hasRequiredErrorEvent;

    function requireErrorEvent () {
    	if (hasRequiredErrorEvent) return ErrorEvent;
    	hasRequiredErrorEvent = 1;
    	var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    	    var extendStatics = function (d, b) {
    	        extendStatics = Object.setPrototypeOf ||
    	            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    	            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    	        return extendStatics(d, b);
    	    };
    	    return function (d, b) {
    	        extendStatics(d, b);
    	        function __() { this.constructor = d; }
    	        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    	    };
    	})();
    	Object.defineProperty(ErrorEvent, "__esModule", { value: true });
    	var Event_1 = requireEvent();
    	var ErrorEvent$1 = /** @class */ (function (_super) {
    	    __extends(ErrorEvent, _super);
    	    function ErrorEvent(type, init) {
    	        return _super.call(this, type, init) || this;
    	    }
    	    return ErrorEvent;
    	}(Event_1.Event));
    	ErrorEvent.ErrorEvent = ErrorEvent$1;
    	
    	return ErrorEvent;
    }

    var hasRequiredWebSocket;

    function requireWebSocket () {
    	if (hasRequiredWebSocket) return WebSocket$1;
    	hasRequiredWebSocket = 1;
    	(function (exports) {
    		var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    		    var extendStatics = function (d, b) {
    		        extendStatics = Object.setPrototypeOf ||
    		            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    		            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    		        return extendStatics(d, b);
    		    };
    		    return function (d, b) {
    		        extendStatics(d, b);
    		        function __() { this.constructor = d; }
    		        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    		    };
    		})();
    		var __assign = (commonjsGlobal && commonjsGlobal.__assign) || function () {
    		    __assign = Object.assign || function(t) {
    		        for (var s, i = 1, n = arguments.length; i < n; i++) {
    		            s = arguments[i];
    		            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
    		                t[p] = s[p];
    		        }
    		        return t;
    		    };
    		    return __assign.apply(this, arguments);
    		};
    		Object.defineProperty(exports, "__esModule", { value: true });
    		var websocket_1 = requireBrowser();
    		var EventTarget_1 = requireEventTarget();
    		var Event_1 = requireEvent();
    		var CloseEvent_1 = requireCloseEvent();
    		var MessageEvent_1 = requireMessageEvent();
    		var ErrorEvent_1 = requireErrorEvent();
    		var WebSocket = /** @class */ (function (_super) {
    		    __extends(WebSocket, _super);
    		    /* ----------------------------------------------------------------
    		        CONSTRUCTORS
    		    ---------------------------------------------------------------- */
    		    function WebSocket(url, protocols) {
    		        var _this = _super.call(this) || this;
    		        _this.on_ = {};
    		        _this.state_ = WebSocket.CONNECTING;
    		        //----
    		        // CLIENT
    		        //----
    		        // PREPARE SOCKET
    		        _this.client_ = new websocket_1.client();
    		        _this.client_.on("connect", _this._Handle_connect.bind(_this));
    		        _this.client_.on("connectFailed", _this._Handle_error.bind(_this));
    		        if (typeof protocols === "string")
    		            protocols = [protocols];
    		        // DO CONNECT
    		        _this.client_.connect(url, protocols);
    		        return _this;
    		    }
    		    WebSocket.prototype.close = function (code, reason) {
    		        this.state_ = WebSocket.CLOSING;
    		        if (code === undefined)
    		            this.connection_.sendCloseFrame();
    		        else
    		            this.connection_.sendCloseFrame(code, reason, true);
    		    };
    		    /* ================================================================
    		        ACCESSORS
    		            - SENDER
    		            - PROPERTIES
    		            - LISTENERS
    		    ===================================================================
    		        SENDER
    		    ---------------------------------------------------------------- */
    		    WebSocket.prototype.send = function (data) {
    		        if (typeof data.valueOf() === "string")
    		            this.connection_.sendUTF(data);
    		        else {
    		            var buffer = void 0;
    		            if (data instanceof Buffer)
    		                buffer = data;
    		            else if (data instanceof Blob)
    		                buffer = new Buffer(data, "blob");
    		            else if (data.buffer)
    		                buffer = new Buffer(data.buffer);
    		            else
    		                buffer = new Buffer(data);
    		            this.connection_.sendBytes(buffer);
    		        }
    		    };
    		    Object.defineProperty(WebSocket.prototype, "url", {
    		        /* ----------------------------------------------------------------
    		            PROPERTIES
    		        ---------------------------------------------------------------- */
    		        get: function () {
    		            return this.client_.url.href;
    		        },
    		        enumerable: true,
    		        configurable: true
    		    });
    		    Object.defineProperty(WebSocket.prototype, "protocol", {
    		        get: function () {
    		            return this.client_.protocols
    		                ? this.client_.protocols[0]
    		                : "";
    		        },
    		        enumerable: true,
    		        configurable: true
    		    });
    		    Object.defineProperty(WebSocket.prototype, "extensions", {
    		        get: function () {
    		            return this.connection_ && this.connection_.extensions
    		                ? this.connection_.extensions[0].name
    		                : "";
    		        },
    		        enumerable: true,
    		        configurable: true
    		    });
    		    Object.defineProperty(WebSocket.prototype, "readyState", {
    		        get: function () {
    		            return this.state_;
    		        },
    		        enumerable: true,
    		        configurable: true
    		    });
    		    Object.defineProperty(WebSocket.prototype, "bufferedAmount", {
    		        get: function () {
    		            return this.connection_.bytesWaitingToFlush;
    		        },
    		        enumerable: true,
    		        configurable: true
    		    });
    		    Object.defineProperty(WebSocket.prototype, "binaryType", {
    		        get: function () {
    		            return "arraybuffer";
    		        },
    		        enumerable: true,
    		        configurable: true
    		    });
    		    Object.defineProperty(WebSocket.prototype, "onopen", {
    		        /* ----------------------------------------------------------------
    		            LISTENERS
    		        ---------------------------------------------------------------- */
    		        get: function () {
    		            return this.on_.open;
    		        },
    		        set: function (listener) {
    		            this._Set_on("open", listener);
    		        },
    		        enumerable: true,
    		        configurable: true
    		    });
    		    Object.defineProperty(WebSocket.prototype, "onclose", {
    		        get: function () {
    		            return this.on_.close;
    		        },
    		        set: function (listener) {
    		            this._Set_on("close", listener);
    		        },
    		        enumerable: true,
    		        configurable: true
    		    });
    		    Object.defineProperty(WebSocket.prototype, "onmessage", {
    		        get: function () {
    		            return this.on_.message;
    		        },
    		        set: function (listener) {
    		            this._Set_on("message", listener);
    		        },
    		        enumerable: true,
    		        configurable: true
    		    });
    		    Object.defineProperty(WebSocket.prototype, "onerror", {
    		        get: function () {
    		            return this.on_.error;
    		        },
    		        set: function (listener) {
    		            this._Set_on("error", listener);
    		        },
    		        enumerable: true,
    		        configurable: true
    		    });
    		    /**
    		     * @hidden
    		     */
    		    WebSocket.prototype._Set_on = function (type, listener) {
    		        if (this.on_[type])
    		            this.removeEventListener(type, this.on_[type]);
    		        this.addEventListener(type, listener);
    		        this.on_[type] = listener;
    		    };
    		    /* ----------------------------------------------------------------
    		        SOCKET HANDLERS
    		    ---------------------------------------------------------------- */
    		    /**
    		     * @hidden
    		     */
    		    WebSocket.prototype._Handle_connect = function (connection) {
    		        this.connection_ = connection;
    		        this.state_ = WebSocket.OPEN;
    		        this.connection_.on("message", this._Handle_message.bind(this));
    		        this.connection_.on("error", this._Handle_error.bind(this));
    		        this.connection_.on("close", this._Handle_close.bind(this));
    		        var event = new Event_1.Event("open", EVENT_INIT);
    		        this.dispatchEvent(event);
    		    };
    		    /**
    		     * @hidden
    		     */
    		    WebSocket.prototype._Handle_close = function (code, reason) {
    		        var event = new CloseEvent_1.CloseEvent("close", __assign({}, EVENT_INIT, { code: code, reason: reason }));
    		        this.state_ = WebSocket.CLOSED;
    		        this.dispatchEvent(event);
    		    };
    		    /**
    		     * @hidden
    		     */
    		    WebSocket.prototype._Handle_message = function (message) {
    		        var event = new MessageEvent_1.MessageEvent("message", __assign({}, EVENT_INIT, { data: message.binaryData
    		                ? message.binaryData
    		                : message.utf8Data }));
    		        this.dispatchEvent(event);
    		    };
    		    /**
    		     * @hidden
    		     */
    		    WebSocket.prototype._Handle_error = function (error) {
    		        var event = new ErrorEvent_1.ErrorEvent("error", __assign({}, EVENT_INIT, { error: error, message: error.message }));
    		        if (this.state_ === WebSocket.CONNECTING)
    		            this.state_ = WebSocket.CLOSED;
    		        this.dispatchEvent(event);
    		    };
    		    return WebSocket;
    		}(EventTarget_1.EventTarget));
    		exports.WebSocket = WebSocket;
    		(function (WebSocket) {
    		    WebSocket.CONNECTING = 0;
    		    WebSocket.OPEN = 1;
    		    WebSocket.CLOSING = 2;
    		    WebSocket.CLOSED = 3;
    		})(WebSocket = exports.WebSocket || (exports.WebSocket = {}));
    		exports.WebSocket = WebSocket;
    		var EVENT_INIT = {
    		    bubbles: false,
    		    cancelable: false
    		};
    		
    } (WebSocket$1));
    	return WebSocket$1;
    }

    var node_1 = node;
    if (node_1.is_node())
        commonjsGlobal.WebSocket = requireWebSocket().WebSocket;

    var browserExports = {};
    var browser = {
      get exports(){ return browserExports; },
      set exports(v){ browserExports = v; },
    };

    /**
     * Helpers.
     */

    var ms;
    var hasRequiredMs;

    function requireMs () {
    	if (hasRequiredMs) return ms;
    	hasRequiredMs = 1;
    	var s = 1000;
    	var m = s * 60;
    	var h = m * 60;
    	var d = h * 24;
    	var w = d * 7;
    	var y = d * 365.25;

    	/**
    	 * Parse or format the given `val`.
    	 *
    	 * Options:
    	 *
    	 *  - `long` verbose formatting [false]
    	 *
    	 * @param {String|Number} val
    	 * @param {Object} [options]
    	 * @throws {Error} throw an error if val is not a non-empty string or a number
    	 * @return {String|Number}
    	 * @api public
    	 */

    	ms = function(val, options) {
    	  options = options || {};
    	  var type = typeof val;
    	  if (type === 'string' && val.length > 0) {
    	    return parse(val);
    	  } else if (type === 'number' && isFinite(val)) {
    	    return options.long ? fmtLong(val) : fmtShort(val);
    	  }
    	  throw new Error(
    	    'val is not a non-empty string or a valid number. val=' +
    	      JSON.stringify(val)
    	  );
    	};

    	/**
    	 * Parse the given `str` and return milliseconds.
    	 *
    	 * @param {String} str
    	 * @return {Number}
    	 * @api private
    	 */

    	function parse(str) {
    	  str = String(str);
    	  if (str.length > 100) {
    	    return;
    	  }
    	  var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
    	    str
    	  );
    	  if (!match) {
    	    return;
    	  }
    	  var n = parseFloat(match[1]);
    	  var type = (match[2] || 'ms').toLowerCase();
    	  switch (type) {
    	    case 'years':
    	    case 'year':
    	    case 'yrs':
    	    case 'yr':
    	    case 'y':
    	      return n * y;
    	    case 'weeks':
    	    case 'week':
    	    case 'w':
    	      return n * w;
    	    case 'days':
    	    case 'day':
    	    case 'd':
    	      return n * d;
    	    case 'hours':
    	    case 'hour':
    	    case 'hrs':
    	    case 'hr':
    	    case 'h':
    	      return n * h;
    	    case 'minutes':
    	    case 'minute':
    	    case 'mins':
    	    case 'min':
    	    case 'm':
    	      return n * m;
    	    case 'seconds':
    	    case 'second':
    	    case 'secs':
    	    case 'sec':
    	    case 's':
    	      return n * s;
    	    case 'milliseconds':
    	    case 'millisecond':
    	    case 'msecs':
    	    case 'msec':
    	    case 'ms':
    	      return n;
    	    default:
    	      return undefined;
    	  }
    	}

    	/**
    	 * Short format for `ms`.
    	 *
    	 * @param {Number} ms
    	 * @return {String}
    	 * @api private
    	 */

    	function fmtShort(ms) {
    	  var msAbs = Math.abs(ms);
    	  if (msAbs >= d) {
    	    return Math.round(ms / d) + 'd';
    	  }
    	  if (msAbs >= h) {
    	    return Math.round(ms / h) + 'h';
    	  }
    	  if (msAbs >= m) {
    	    return Math.round(ms / m) + 'm';
    	  }
    	  if (msAbs >= s) {
    	    return Math.round(ms / s) + 's';
    	  }
    	  return ms + 'ms';
    	}

    	/**
    	 * Long format for `ms`.
    	 *
    	 * @param {Number} ms
    	 * @return {String}
    	 * @api private
    	 */

    	function fmtLong(ms) {
    	  var msAbs = Math.abs(ms);
    	  if (msAbs >= d) {
    	    return plural(ms, msAbs, d, 'day');
    	  }
    	  if (msAbs >= h) {
    	    return plural(ms, msAbs, h, 'hour');
    	  }
    	  if (msAbs >= m) {
    	    return plural(ms, msAbs, m, 'minute');
    	  }
    	  if (msAbs >= s) {
    	    return plural(ms, msAbs, s, 'second');
    	  }
    	  return ms + ' ms';
    	}

    	/**
    	 * Pluralization helper.
    	 */

    	function plural(ms, msAbs, n, name) {
    	  var isPlural = msAbs >= n * 1.5;
    	  return Math.round(ms / n) + ' ' + name + (isPlural ? 's' : '');
    	}
    	return ms;
    }

    /**
     * This is the common logic for both the Node.js and web browser
     * implementations of `debug()`.
     */

    function setup(env) {
    	createDebug.debug = createDebug;
    	createDebug.default = createDebug;
    	createDebug.coerce = coerce;
    	createDebug.disable = disable;
    	createDebug.enable = enable;
    	createDebug.enabled = enabled;
    	createDebug.humanize = requireMs();
    	createDebug.destroy = destroy;

    	Object.keys(env).forEach(key => {
    		createDebug[key] = env[key];
    	});

    	/**
    	* The currently active debug mode names, and names to skip.
    	*/

    	createDebug.names = [];
    	createDebug.skips = [];

    	/**
    	* Map of special "%n" handling functions, for the debug "format" argument.
    	*
    	* Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
    	*/
    	createDebug.formatters = {};

    	/**
    	* Selects a color for a debug namespace
    	* @param {String} namespace The namespace string for the debug instance to be colored
    	* @return {Number|String} An ANSI color code for the given namespace
    	* @api private
    	*/
    	function selectColor(namespace) {
    		let hash = 0;

    		for (let i = 0; i < namespace.length; i++) {
    			hash = ((hash << 5) - hash) + namespace.charCodeAt(i);
    			hash |= 0; // Convert to 32bit integer
    		}

    		return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
    	}
    	createDebug.selectColor = selectColor;

    	/**
    	* Create a debugger with the given `namespace`.
    	*
    	* @param {String} namespace
    	* @return {Function}
    	* @api public
    	*/
    	function createDebug(namespace) {
    		let prevTime;
    		let enableOverride = null;
    		let namespacesCache;
    		let enabledCache;

    		function debug(...args) {
    			// Disabled?
    			if (!debug.enabled) {
    				return;
    			}

    			const self = debug;

    			// Set `diff` timestamp
    			const curr = Number(new Date());
    			const ms = curr - (prevTime || curr);
    			self.diff = ms;
    			self.prev = prevTime;
    			self.curr = curr;
    			prevTime = curr;

    			args[0] = createDebug.coerce(args[0]);

    			if (typeof args[0] !== 'string') {
    				// Anything else let's inspect with %O
    				args.unshift('%O');
    			}

    			// Apply any `formatters` transformations
    			let index = 0;
    			args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
    				// If we encounter an escaped % then don't increase the array index
    				if (match === '%%') {
    					return '%';
    				}
    				index++;
    				const formatter = createDebug.formatters[format];
    				if (typeof formatter === 'function') {
    					const val = args[index];
    					match = formatter.call(self, val);

    					// Now we need to remove `args[index]` since it's inlined in the `format`
    					args.splice(index, 1);
    					index--;
    				}
    				return match;
    			});

    			// Apply env-specific formatting (colors, etc.)
    			createDebug.formatArgs.call(self, args);

    			const logFn = self.log || createDebug.log;
    			logFn.apply(self, args);
    		}

    		debug.namespace = namespace;
    		debug.useColors = createDebug.useColors();
    		debug.color = createDebug.selectColor(namespace);
    		debug.extend = extend;
    		debug.destroy = createDebug.destroy; // XXX Temporary. Will be removed in the next major release.

    		Object.defineProperty(debug, 'enabled', {
    			enumerable: true,
    			configurable: false,
    			get: () => {
    				if (enableOverride !== null) {
    					return enableOverride;
    				}
    				if (namespacesCache !== createDebug.namespaces) {
    					namespacesCache = createDebug.namespaces;
    					enabledCache = createDebug.enabled(namespace);
    				}

    				return enabledCache;
    			},
    			set: v => {
    				enableOverride = v;
    			}
    		});

    		// Env-specific initialization logic for debug instances
    		if (typeof createDebug.init === 'function') {
    			createDebug.init(debug);
    		}

    		return debug;
    	}

    	function extend(namespace, delimiter) {
    		const newDebug = createDebug(this.namespace + (typeof delimiter === 'undefined' ? ':' : delimiter) + namespace);
    		newDebug.log = this.log;
    		return newDebug;
    	}

    	/**
    	* Enables a debug mode by namespaces. This can include modes
    	* separated by a colon and wildcards.
    	*
    	* @param {String} namespaces
    	* @api public
    	*/
    	function enable(namespaces) {
    		createDebug.save(namespaces);
    		createDebug.namespaces = namespaces;

    		createDebug.names = [];
    		createDebug.skips = [];

    		let i;
    		const split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
    		const len = split.length;

    		for (i = 0; i < len; i++) {
    			if (!split[i]) {
    				// ignore empty strings
    				continue;
    			}

    			namespaces = split[i].replace(/\*/g, '.*?');

    			if (namespaces[0] === '-') {
    				createDebug.skips.push(new RegExp('^' + namespaces.slice(1) + '$'));
    			} else {
    				createDebug.names.push(new RegExp('^' + namespaces + '$'));
    			}
    		}
    	}

    	/**
    	* Disable debug output.
    	*
    	* @return {String} namespaces
    	* @api public
    	*/
    	function disable() {
    		const namespaces = [
    			...createDebug.names.map(toNamespace),
    			...createDebug.skips.map(toNamespace).map(namespace => '-' + namespace)
    		].join(',');
    		createDebug.enable('');
    		return namespaces;
    	}

    	/**
    	* Returns true if the given mode name is enabled, false otherwise.
    	*
    	* @param {String} name
    	* @return {Boolean}
    	* @api public
    	*/
    	function enabled(name) {
    		if (name[name.length - 1] === '*') {
    			return true;
    		}

    		let i;
    		let len;

    		for (i = 0, len = createDebug.skips.length; i < len; i++) {
    			if (createDebug.skips[i].test(name)) {
    				return false;
    			}
    		}

    		for (i = 0, len = createDebug.names.length; i < len; i++) {
    			if (createDebug.names[i].test(name)) {
    				return true;
    			}
    		}

    		return false;
    	}

    	/**
    	* Convert regexp to namespace
    	*
    	* @param {RegExp} regxep
    	* @return {String} namespace
    	* @api private
    	*/
    	function toNamespace(regexp) {
    		return regexp.toString()
    			.substring(2, regexp.toString().length - 2)
    			.replace(/\.\*\?$/, '*');
    	}

    	/**
    	* Coerce `val`.
    	*
    	* @param {Mixed} val
    	* @return {Mixed}
    	* @api private
    	*/
    	function coerce(val) {
    		if (val instanceof Error) {
    			return val.stack || val.message;
    		}
    		return val;
    	}

    	/**
    	* XXX DO NOT USE. This is a temporary stub function.
    	* XXX It WILL be removed in the next major release.
    	*/
    	function destroy() {
    		console.warn('Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.');
    	}

    	createDebug.enable(createDebug.load());

    	return createDebug;
    }

    var common = setup;

    /* eslint-env browser */

    (function (module, exports) {
    	/**
    	 * This is the web browser implementation of `debug()`.
    	 */

    	exports.formatArgs = formatArgs;
    	exports.save = save;
    	exports.load = load;
    	exports.useColors = useColors;
    	exports.storage = localstorage();
    	exports.destroy = (() => {
    		let warned = false;

    		return () => {
    			if (!warned) {
    				warned = true;
    				console.warn('Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.');
    			}
    		};
    	})();

    	/**
    	 * Colors.
    	 */

    	exports.colors = [
    		'#0000CC',
    		'#0000FF',
    		'#0033CC',
    		'#0033FF',
    		'#0066CC',
    		'#0066FF',
    		'#0099CC',
    		'#0099FF',
    		'#00CC00',
    		'#00CC33',
    		'#00CC66',
    		'#00CC99',
    		'#00CCCC',
    		'#00CCFF',
    		'#3300CC',
    		'#3300FF',
    		'#3333CC',
    		'#3333FF',
    		'#3366CC',
    		'#3366FF',
    		'#3399CC',
    		'#3399FF',
    		'#33CC00',
    		'#33CC33',
    		'#33CC66',
    		'#33CC99',
    		'#33CCCC',
    		'#33CCFF',
    		'#6600CC',
    		'#6600FF',
    		'#6633CC',
    		'#6633FF',
    		'#66CC00',
    		'#66CC33',
    		'#9900CC',
    		'#9900FF',
    		'#9933CC',
    		'#9933FF',
    		'#99CC00',
    		'#99CC33',
    		'#CC0000',
    		'#CC0033',
    		'#CC0066',
    		'#CC0099',
    		'#CC00CC',
    		'#CC00FF',
    		'#CC3300',
    		'#CC3333',
    		'#CC3366',
    		'#CC3399',
    		'#CC33CC',
    		'#CC33FF',
    		'#CC6600',
    		'#CC6633',
    		'#CC9900',
    		'#CC9933',
    		'#CCCC00',
    		'#CCCC33',
    		'#FF0000',
    		'#FF0033',
    		'#FF0066',
    		'#FF0099',
    		'#FF00CC',
    		'#FF00FF',
    		'#FF3300',
    		'#FF3333',
    		'#FF3366',
    		'#FF3399',
    		'#FF33CC',
    		'#FF33FF',
    		'#FF6600',
    		'#FF6633',
    		'#FF9900',
    		'#FF9933',
    		'#FFCC00',
    		'#FFCC33'
    	];

    	/**
    	 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
    	 * and the Firebug extension (any Firefox version) are known
    	 * to support "%c" CSS customizations.
    	 *
    	 * TODO: add a `localStorage` variable to explicitly enable/disable colors
    	 */

    	// eslint-disable-next-line complexity
    	function useColors() {
    		// NB: In an Electron preload script, document will be defined but not fully
    		// initialized. Since we know we're in Chrome, we'll just detect this case
    		// explicitly
    		if (typeof window !== 'undefined' && window.process && (window.process.type === 'renderer' || window.process.__nwjs)) {
    			return true;
    		}

    		// Internet Explorer and Edge do not support colors.
    		if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
    			return false;
    		}

    		// Is webkit? http://stackoverflow.com/a/16459606/376773
    		// document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
    		return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
    			// Is firebug? http://stackoverflow.com/a/398120/376773
    			(typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
    			// Is firefox >= v31?
    			// https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    			(typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
    			// Double check webkit in userAgent just in case we are in a worker
    			(typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
    	}

    	/**
    	 * Colorize log arguments if enabled.
    	 *
    	 * @api public
    	 */

    	function formatArgs(args) {
    		args[0] = (this.useColors ? '%c' : '') +
    			this.namespace +
    			(this.useColors ? ' %c' : ' ') +
    			args[0] +
    			(this.useColors ? '%c ' : ' ') +
    			'+' + module.exports.humanize(this.diff);

    		if (!this.useColors) {
    			return;
    		}

    		const c = 'color: ' + this.color;
    		args.splice(1, 0, c, 'color: inherit');

    		// The final "%c" is somewhat tricky, because there could be other
    		// arguments passed either before or after the %c, so we need to
    		// figure out the correct index to insert the CSS into
    		let index = 0;
    		let lastC = 0;
    		args[0].replace(/%[a-zA-Z%]/g, match => {
    			if (match === '%%') {
    				return;
    			}
    			index++;
    			if (match === '%c') {
    				// We only are interested in the *last* %c
    				// (the user may have provided their own)
    				lastC = index;
    			}
    		});

    		args.splice(lastC, 0, c);
    	}

    	/**
    	 * Invokes `console.debug()` when available.
    	 * No-op when `console.debug` is not a "function".
    	 * If `console.debug` is not available, falls back
    	 * to `console.log`.
    	 *
    	 * @api public
    	 */
    	exports.log = console.debug || console.log || (() => {});

    	/**
    	 * Save `namespaces`.
    	 *
    	 * @param {String} namespaces
    	 * @api private
    	 */
    	function save(namespaces) {
    		try {
    			if (namespaces) {
    				exports.storage.setItem('debug', namespaces);
    			} else {
    				exports.storage.removeItem('debug');
    			}
    		} catch (error) {
    			// Swallow
    			// XXX (@Qix-) should we be logging these?
    		}
    	}

    	/**
    	 * Load `namespaces`.
    	 *
    	 * @return {String} returns the previously persisted debug modes
    	 * @api private
    	 */
    	function load() {
    		let r;
    		try {
    			r = exports.storage.getItem('debug');
    		} catch (error) {
    			// Swallow
    			// XXX (@Qix-) should we be logging these?
    		}

    		// If debug isn't set in LS, and we're in Electron, try to load $DEBUG
    		if (!r && typeof process !== 'undefined' && 'env' in process) {
    			r = process.env.DEBUG;
    		}

    		return r;
    	}

    	/**
    	 * Localstorage attempts to return the localstorage.
    	 *
    	 * This is necessary because safari throws
    	 * when a user disables cookies/localstorage
    	 * and you attempt to access it.
    	 *
    	 * @return {LocalStorage}
    	 * @api private
    	 */

    	function localstorage() {
    		try {
    			// TVMLKit (Apple TV JS Runtime) does not have a window object, just localStorage in the global context
    			// The Browser also has localStorage in the global context.
    			return localStorage;
    		} catch (error) {
    			// Swallow
    			// XXX (@Qix-) should we be logging these?
    		}
    	}

    	module.exports = common(exports);

    	const {formatters} = module.exports;

    	/**
    	 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
    	 */

    	formatters.j = function (v) {
    		try {
    			return JSON.stringify(v);
    		} catch (error) {
    			return '[UnexpectedJSONParseError]: ' + error.message;
    		}
    	};
    } (browser, browserExports));

    ({
      m: BigInt(1e3),
      u: BigInt(1e6),
      n: BigInt(1e9),
      p: BigInt(1e12)
    });

    BigInt('2100000000000000000');

    BigInt(1e11);

    const TAGCODES = {
      payment_hash: 1,
      payment_secret: 16,
      description: 13,
      payee: 19,
      description_hash: 23, // commit to longer descriptions (used by lnurl-pay)
      expiry: 6, // default: 3600 (1 hour)
      min_final_cltv_expiry: 24, // default: 9
      fallback_address: 9,
      route_hint: 3, // for extra routing info (private etc.)
      feature_bits: 5,
      metadata: 27
    };
    for (let i = 0, keys = Object.keys(TAGCODES); i < keys.length; i++) {
      keys[i];
      TAGCODES[keys[i]].toString();
    }

    // src/events/index.ts
    var Zap = class extends eventemitter3Exports {
      ndk;
      zappedEvent;
      zappedUser;
      constructor(args) {
        super();
        this.ndk = args.ndk;
        this.zappedEvent = args.zappedEvent;
        this.zappedUser = args.zappedUser || this.ndk.getUser({ hexpubkey: this.zappedEvent.pubkey });
      }
      async getZapEndpoint() {
        let lud06;
        let lud16;
        let zapEndpoint;
        let zapEndpointCallback;
        if (this.zappedEvent) {
          const zapTag = (await this.zappedEvent.getMatchingTags("zap"))[0];
          if (zapTag) {
            switch (zapTag[2]) {
              case "lud06":
                lud06 = zapTag[1];
                break;
              case "lud16":
                lud16 = zapTag[1];
                break;
              default:
                throw new Error(`Unknown zap tag ${zapTag}`);
            }
          }
        }
        if (this.zappedUser) {
          if (!this.zappedUser.profile) {
            await this.zappedUser.fetchProfile();
          }
          lud06 = (this.zappedUser.profile || {}).lud06;
          lud16 = (this.zappedUser.profile || {}).lud16;
        }
        if (lud16) {
          const [name, domain] = lud16.split("@");
          zapEndpoint = `https://${domain}/.well-known/lnurlp/${name}`;
        } else if (lud06) {
          const { words } = bech32.decode(lud06, 1e3);
          const data = bech32.fromWords(words);
          const utf8Decoder = new TextDecoder("utf-8");
          zapEndpoint = utf8Decoder.decode(data);
        }
        if (!zapEndpoint) {
          throw new Error("No zap endpoint found");
        }
        const response = await fetch(zapEndpoint);
        const body = await response.json();
        if (body?.allowsNostr && body?.nostrPubkey) {
          zapEndpointCallback = body.callback;
        }
        return zapEndpointCallback;
      }
      async createZapRequest(amount, comment) {
        const zapEndpoint = await this.getZapEndpoint();
        if (!zapEndpoint) {
          throw new Error("No zap endpoint found");
        }
        if (!this.zappedEvent)
          throw new Error("No zapped event found");
        const zapRequest = nip57_exports.makeZapRequest({
          profile: this.zappedUser.hexpubkey(),
          event: this.zappedEvent?.id,
          amount,
          comment: comment || "",
          relays: ["wss://nos.lol", "wss://relay.nostr.band", "wss://relay.f7z.io", "wss://relay.damus.io", "wss://nostr.mom", "wss://no.str.cr"]
          // TODO: fix this
        });
        const zapRequestEvent = new NDKEvent(this.ndk, zapRequest);
        await zapRequestEvent.sign();
        const zapRequestNostrEvent = await zapRequestEvent.toNostrEvent();
        const response = await fetch(
          `${zapEndpoint}?` + new URLSearchParams({
            amount: amount.toString(),
            nostr: JSON.stringify(zapRequestNostrEvent)
          })
        );
        const body = await response.json();
        return body.pr;
      }
    };
    function generateContentTags(content, tags = []) {
      const tagRegex = /@(npub|nprofile|note)[a-zA-Z0-9]+/g;
      content = content.replace(tagRegex, (tag) => {
        try {
          const { type, data } = nip19_exports.decode(tag.slice(1));
          const tagIndex = tags.length;
          switch (type) {
            case "npub":
              tags.push(["p", data]);
              break;
            case "nprofile":
              tags.push(["p", data.pubkey]);
              break;
            case "nevent":
              tags.push(["e", data.id]);
              break;
            case "note":
              tags.push(["e", data]);
              break;
          }
          return `#[${tagIndex}]`;
        } catch (error) {
          return tag;
        }
      });
      return { content, tags };
    }

    // src/events/kind.ts
    function isReplaceable() {
      if (!this.kind)
        throw new Error("Kind not set");
      return this.kind >= 1e4 && this.kind <= 3e4;
    }
    function isParamReplaceable() {
      if (!this.kind)
        throw new Error("Kind not set");
      return this.kind >= 3e4 && this.kind <= 4e4;
    }
    function encode() {
      if (this.isParamReplaceable()) {
        return nip19_exports.naddrEncode({
          kind: this.kind,
          pubkey: this.pubkey,
          identifier: this.replaceableDTag()
        });
      } else {
        return nip19_exports.noteEncode(this.tagId());
      }
    }

    // src/events/index.ts
    var NDKEvent = class extends eventemitter3Exports {
      ndk;
      created_at;
      content = "";
      subject;
      tags = [];
      kind;
      id = "";
      sig;
      pubkey = "";
      constructor(ndk, event) {
        super();
        this.ndk = ndk;
        this.created_at = event?.created_at;
        this.content = event?.content || "";
        this.subject = event?.subject;
        this.tags = event?.tags || [];
        this.id = event?.id || "";
        this.sig = event?.sig;
        this.pubkey = event?.pubkey || "";
        this.kind = event?.kind;
      }
      /**
       * Returns the event as is.
       */
      rawEvent() {
        return {
          created_at: this.created_at,
          content: this.content,
          tags: this.tags,
          kind: this.kind,
          pubkey: this.pubkey,
          id: this.id
        };
      }
      /**
       * Return a NostrEvent object, trying to fill in missing fields
       * when possible.
       */
      async toNostrEvent(pubkey) {
        if (!pubkey && this.pubkey === "") {
          const user = await this.ndk?.signer?.user();
          this.pubkey = user?.hexpubkey() || "";
        }
        const nostrEvent = {
          created_at: this.created_at || Math.floor(Date.now() / 1e3),
          content: this.content,
          tags: this.tags,
          kind: this.kind,
          pubkey: this.pubkey,
          id: this.id
        };
        this.generateTags();
        if (this.subject)
          nostrEvent.subject = this.subject;
        try {
          nostrEvent.id = getEventHash(nostrEvent);
        } catch (e) {
        }
        if (this.sig)
          nostrEvent.sig = this.sig;
        return nostrEvent;
      }
      isReplaceable = isReplaceable.bind(this);
      isParamReplaceable = isParamReplaceable.bind(this);
      encode = encode.bind(this);
      /**
       * Get all tags with the given name
       */
      getMatchingTags(tagName) {
        return this.tags.filter((tag) => tag[0] === tagName);
      }
      async toString() {
        return await this.toNostrEvent();
      }
      async sign() {
        this.ndk?.assertSigner();
        await this.generateTags();
        const nostrEvent = await this.toNostrEvent();
        this.sig = await this.ndk?.signer?.sign(nostrEvent);
      }
      async publish() {
        if (!this.sig)
          await this.sign();
        return this.ndk?.publish(this);
      }
      async generateTags() {
        if (this.tags.length > 0) {
          const { content, tags } = generateContentTags(this.content, this.tags);
          this.content = content;
          this.tags = tags;
        }
        if (this.kind && this.kind >= 3e4 && this.kind <= 4e4) {
          const dTag = this.getMatchingTags("d")[0];
          if (!dTag) {
            const str = [...Array(16)].map(() => Math.random().toString(36)[2]).join("");
            this.tags.push(["d", str]);
          }
        }
      }
      /**
       * @returns the `d` tag of a parameterized replaceable event
       */
      replaceableDTag() {
        if (this.kind && this.kind >= 3e4 && this.kind <= 4e4) {
          const dTag = this.getMatchingTags("d")[0];
          const dTagId = dTag ? dTag[1] : "";
          return dTagId;
        }
        throw new Error("Event is not a parameterized replaceable event");
      }
      /**
       * @returns the id of the event, or if it's a parameterized event, the id of the event with the d tag
       */
      tagId() {
        if (this.kind && this.kind >= 3e4 && this.kind <= 4e4) {
          const dTagId = this.replaceableDTag();
          return `${this.kind}:${this.pubkey}:${dTagId}`;
        }
        return this.id;
      }
      /**
       * Get the tag that can be used to reference this event from another event
       * @example
       *     event = new NDKEvent(ndk, { kind: 30000, pubkey: 'pubkey', tags: [ ["d", "d-code"] ] });
       *     event.tagReference(); // ["a", "30000:pubkey:d-code"]
       *
       *     event = new NDKEvent(ndk, { kind: 1, pubkey: 'pubkey', id: "eventid" });
       *     event.tagReference(); // ["e", "eventid"]
       */
      tagReference() {
        if (this.kind && this.kind >= 3e4 && this.kind <= 4e4) {
          return ["a", this.tagId()];
        }
        return ["e", this.tagId()];
      }
      /**
       * Create a zap request for an existing event
       */
      async zap(amount, comment) {
        if (!this.ndk)
          throw new Error("No NDK instance found");
        this.ndk.assertSigner();
        const zap = new Zap({
          ndk: this.ndk,
          zappedEvent: this
        });
        const paymentRequest = await zap.createZapRequest(amount, comment);
        return paymentRequest;
      }
    };
    var NDKRelay = class extends eventemitter3Exports {
      url;
      scores;
      relay;
      _status;
      connectedAt;
      _connectionStats = { attempts: 0, success: 0, durations: [] };
      complaining = false;
      /**
       * Active subscriptions this relay is connected to
       */
      activeSubscriptions = /* @__PURE__ */ new Set();
      constructor(url) {
        super();
        this.url = url;
        this.relay = relayInit(url);
        this.scores = /* @__PURE__ */ new Map();
        this._status = 3 /* DISCONNECTED */;
        this.relay.on("connect", () => {
          this.updateConnectionStats.connected();
          this.emit("connect");
          this._status = 1 /* CONNECTED */;
        });
        this.relay.on("disconnect", () => {
          this.updateConnectionStats.disconnected();
          this.emit("disconnect");
          if (this._status === 1 /* CONNECTED */) {
            this._status = 3 /* DISCONNECTED */;
            this.handleReconnection();
          }
        });
        this.relay.on("notice", (notice) => this.handleNotice(notice));
      }
      /**
       * Evaluates the connection stats to determine if the relay is flapping.
       */
      isFlapping() {
        const durations = this._connectionStats.durations;
        if (durations.length < 10)
          return false;
        const sum = durations.reduce((a, b) => a + b, 0);
        const avg = sum / durations.length;
        const variance = durations.map((x) => Math.pow(x - avg, 2)).reduce((a, b) => a + b, 0) / durations.length;
        const stdDev = Math.sqrt(variance);
        const isFlapping = stdDev < 1e3;
        return isFlapping;
      }
      /**
       * Called when the relay is unexpectedly disconnected.
       */
      handleReconnection() {
        if (this.isFlapping()) {
          this.emit("flapping", this, this._connectionStats);
        }
        if (this.connectedAt && Date.now() - this.connectedAt < 5e3) {
          setTimeout(() => this.connect(), 6e4);
        } else {
          this.connect();
        }
      }
      get status() {
        return this._status;
      }
      /**
       * Connects to the relay.
       */
      async connect() {
        try {
          this.updateConnectionStats.attempt();
          this._status = 0 /* CONNECTING */;
          await this.relay.connect();
        } catch (e) {
        }
      }
      /**
       * Disconnects from the relay.
       */
      disconnect() {
        this._status = 2 /* DISCONNECTING */;
        this.relay.close();
      }
      async handleNotice(notice) {
        if (notice.includes("oo many") || notice.includes("aximum")) {
          this.disconnect();
          setTimeout(() => this.connect(), 2e3);
          console.log(this.relay.url, "Relay complaining?", notice);
        }
        this.emit("notice", this, notice);
      }
      /**
       * Subscribes to a subscription.
       */
      subscribe(subscription) {
        const { filter } = subscription;
        const sub = this.relay.sub([filter], {
          id: subscription.subId
        });
        sub.on("event", (event) => {
          const e = new NDKEvent(void 0, event);
          subscription.eventReceived(e, this);
        });
        sub.on("eose", () => {
          subscription.eoseReceived(this);
        });
        this.activeSubscriptions.add(subscription);
        subscription.on("close", () => {
          this.activeSubscriptions.delete(subscription);
        });
        return sub;
      }
      /**
       * Publishes an event to the relay.
       */
      async publish(event) {
        const nostrEvent = await event.toNostrEvent();
        this.relay.publish(nostrEvent);
      }
      /**
       * Called when this relay has responded with an event but
       * wasn't the fastest one.
       * @param timeDiffInMs The time difference in ms between the fastest and this relay in milliseconds
       */
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      scoreSlowerEvent(timeDiffInMs) {
      }
      /**
       * Utility functions to update the connection stats.
       */
      updateConnectionStats = {
        connected: () => {
          this._connectionStats.success++;
          this._connectionStats.connectedAt = Date.now();
        },
        disconnected: () => {
          if (this._connectionStats.connectedAt) {
            this._connectionStats.durations.push(Date.now() - this._connectionStats.connectedAt);
            if (this._connectionStats.durations.length > 100) {
              this._connectionStats.durations.shift();
            }
          }
          this._connectionStats.connectedAt = void 0;
        },
        attempt: () => {
          this._connectionStats.attempts++;
        }
      };
      /**
       * Returns the connection stats.
       */
      get connectionStats() {
        return this._connectionStats;
      }
    };

    // src/relay/pool/index.ts
    var NDKPool = class extends eventemitter3Exports {
      relays = /* @__PURE__ */ new Map();
      debug;
      constructor(relayUrls = [], ndk) {
        super();
        this.debug = ndk.debug.extend("pool");
        relayUrls.forEach((relayUrl) => {
          const relay = new NDKRelay(relayUrl);
          relay.on("notice", (relay2, notice) => this.emit("notice", relay2, notice));
          relay.on("connect", () => this.emit("connect", relay));
          relay.on("disconnect", () => this.emit("disconnect", relay));
          relay.on("flapping", () => this.handleFlapping(relay));
          this.relays.set(relayUrl, relay);
        });
      }
      /**
       * Attempts to establish a connection to each relay in the pool.
       *
       * @async
       * @param {number} [timeoutMs] - Optional timeout in milliseconds for each connection attempt.
       * @returns {Promise<void>} A promise that resolves when all connection attempts have completed.
       * @throws {Error} If any of the connection attempts result in an error or timeout.
       */
      async connect(timeoutMs) {
        const promises = [];
        this.debug(`Connecting to ${this.relays.size} relays${timeoutMs ? `, timeout ${timeoutMs}...` : ""}`);
        for (const relay of this.relays.values()) {
          if (timeoutMs) {
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(`Timed out after ${timeoutMs}ms`), timeoutMs);
            });
            promises.push(
              Promise.race([
                relay.connect(),
                timeoutPromise
              ]).catch((e) => {
                this.debug(`Failed to connect to relay ${relay.url}: ${e}`);
              })
            );
          } else {
            promises.push(relay.connect());
          }
        }
        await Promise.all(promises);
      }
      handleFlapping(relay) {
        this.debug(`Relay ${relay.url} is flapping`);
        this.relays.delete(relay.url);
        this.emit("flapping", relay);
      }
      size() {
        return this.relays.size;
      }
      /**
       * Returns the status of each relay in the pool.
       * @returns {NDKPoolStats} An object containing the number of relays in each status.
       */
      stats() {
        const stats = {
          total: 0,
          connected: 0,
          disconnected: 0,
          connecting: 0
        };
        for (const relay of this.relays.values()) {
          stats.total++;
          if (relay.status === 1 /* CONNECTED */) {
            stats.connected++;
          } else if (relay.status === 3 /* DISCONNECTED */) {
            stats.disconnected++;
          } else if (relay.status === 0 /* CONNECTING */) {
            stats.connecting++;
          }
        }
        return stats;
      }
    };

    // src/user/profile.ts
    function mergeEvent(event, profile) {
      const payload = JSON.parse(event.content);
      if (payload.name)
        profile.name = payload.name;
      if (payload.display_name)
        profile.displayName = payload.display_name;
      if (payload.displayName)
        profile.displayName = payload.displayName;
      if (payload.image)
        profile.image = payload.image;
      if (payload.picture)
        profile.image = payload.picture;
      if (payload.banner)
        profile.banner = payload.banner;
      if (payload.bio)
        profile.bio = payload.bio;
      if (payload.nip05)
        profile.nip05 = payload.nip05;
      if (payload.lud06)
        profile.lud06 = payload.lud06;
      if (payload.lud16)
        profile.lud16 = payload.lud16;
      if (payload.about)
        profile.about = payload.about;
      if (payload.zapService)
        profile.zapService = payload.zapService;
      return profile;
    }

    // src/user/follows.ts
    async function follows() {
      if (!this.ndk)
        throw new Error("NDK not set");
      const contactListEvents = await this.ndk.fetchEvents({
        kinds: [3],
        authors: [this.hexpubkey()]
      });
      if (contactListEvents) {
        const contactList = /* @__PURE__ */ new Set();
        contactListEvents.forEach((event) => {
          event.tags.forEach((tag) => {
            if (tag[0] === "p") {
              try {
                const user = new NDKUser({ hexpubkey: tag[1] });
                user.ndk = this.ndk;
                contactList.add(user);
              } catch (e) {
              }
            }
          });
        });
        return contactList;
      }
      return /* @__PURE__ */ new Set();
    }

    // src/user/index.ts
    var NDKUser = class {
      ndk;
      profile;
      npub = "";
      relayUrls = [];
      constructor(opts) {
        if (opts.npub)
          this.npub = opts.npub;
        if (opts.hexpubkey) {
          this.npub = nip19_exports.npubEncode(opts.hexpubkey);
        }
        if (opts.relayUrls) {
          this.relayUrls = opts.relayUrls;
        }
      }
      static async fromNip05(nip05Id) {
        const profile = await nip05_exports.queryProfile(nip05Id);
        if (profile) {
          return new NDKUser({
            hexpubkey: profile.pubkey,
            relayUrls: profile.relays
          });
        }
      }
      hexpubkey() {
        return nip19_exports.decode(this.npub).data;
      }
      async fetchProfile() {
        if (!this.ndk)
          throw new Error("NDK not set");
        if (!this.profile)
          this.profile = {};
        const setMetadataEvents = await this.ndk.fetchEvents({
          kinds: [0],
          authors: [this.hexpubkey()]
        });
        if (setMetadataEvents) {
          const sortedSetMetadataEvents = Array.from(setMetadataEvents).sort(
            (a, b) => a.created_at - b.created_at
          );
          sortedSetMetadataEvents.forEach((event) => {
            try {
              this.profile = mergeEvent(event, this.profile);
            } catch (e) {
            }
          });
        }
        return setMetadataEvents;
      }
      /**
       * Returns a set of users that this user follows.
       */
      follows = follows.bind(this);
      async relayList() {
        if (!this.ndk)
          throw new Error("NDK not set");
        const relayListEvents = await this.ndk.fetchEvents({
          kinds: [10002],
          authors: [this.hexpubkey()]
        });
        if (relayListEvents) {
          return relayListEvents;
        }
        return /* @__PURE__ */ new Set();
      }
    };

    // src/relay/sets/index.ts
    var NDKRelaySet = class {
      relays;
      constructor(relays) {
        this.relays = relays;
      }
      subscribeOnRelay(relay, subscription) {
        const sub = relay.subscribe(subscription);
        subscription.relaySubscriptions.set(relay, sub);
      }
      subscribe(subscription) {
        this.relays.forEach((relay) => {
          if (relay.status === 1 /* CONNECTED */) {
            this.subscribeOnRelay(relay, subscription);
          }
        });
        return subscription;
      }
      async publish(event) {
        this.relays.forEach(async (relay) => {
          try {
            await relay.publish(event);
          } catch (e) {
          }
        });
      }
      size() {
        return this.relays.size;
      }
    };

    // src/relay/sets/calculate.ts
    function calculateRelaySetFromEvent(ndk, event) {
      const relays = /* @__PURE__ */ new Set();
      ndk.pool?.relays.forEach((relay) => relays.add(relay));
      return new NDKRelaySet(relays);
    }
    function calculateRelaySetFromFilter(ndk, filter) {
      const relays = /* @__PURE__ */ new Set();
      ndk.pool?.relays.forEach((relay) => {
        if (!relay.complaining) {
          relays.add(relay);
        } else {
          console.log(`Relay ${relay.url} is complaining, not adding to set`);
        }
      });
      return new NDKRelaySet(relays);
    }
    var NDKSubscription = class extends eventemitter3Exports {
      subId;
      filter;
      opts;
      relaySet;
      ndk;
      relaySubscriptions;
      debug;
      constructor(ndk, filter, opts, relaySet, subId) {
        super();
        this.ndk = ndk;
        this.subId = subId || Math.floor(Math.random() * 9999991e3).toString();
        this.filter = filter;
        this.relaySet = relaySet;
        this.opts = opts;
        this.relaySubscriptions = /* @__PURE__ */ new Map();
        this.debug = ndk.debug.extend("subscription");
        if (opts?.cacheUsage === "ONLY_CACHE" /* ONLY_CACHE */ || opts?.cacheUsage === "CACHE_FIRST" /* CACHE_FIRST */) {
          throw new Error(
            "Cannot use cache-only options with a persistent subscription"
          );
        }
      }
      shouldQueryCache() {
        return this.opts?.cacheUsage !== "ONLY_RELAY" /* ONLY_RELAY */;
      }
      shouldQueryRelays() {
        return this.opts?.cacheUsage !== "ONLY_CACHE" /* ONLY_CACHE */;
      }
      /**
       * Start the subscription. This is the main method that should be called
       * after creating a subscription.
       */
      async start() {
        let cachePromise;
        if (this.shouldQueryCache()) {
          cachePromise = this.startWithCache();
          const shouldWaitForCache = this.ndk.cacheAdapter?.locking && this.shouldQueryRelays() && this.opts?.cacheUsage !== "PARALLEL" /* PARALLEL */;
          if (shouldWaitForCache) {
            this.debug("waiting for cache to finish");
            await cachePromise;
            if (this.eventFirstSeen.size > 0) {
              this.debug("cache hit, skipping relay query");
              this.emit("eose", this);
              return;
            }
          }
        }
        if (this.shouldQueryRelays()) {
          this.startWithRelaySet();
        }
        return;
      }
      stop() {
        this.relaySubscriptions.forEach((sub) => sub.unsub());
        this.relaySubscriptions.clear();
        this.emit("close", this);
      }
      async startWithCache() {
        if (this.ndk.cacheAdapter?.query) {
          this.debug("querying cache");
          const promise = this.ndk.cacheAdapter.query(this);
          if (this.ndk.cacheAdapter.locking) {
            await promise;
          }
        }
      }
      startWithRelaySet() {
        if (!this.relaySet) {
          this.relaySet = calculateRelaySetFromFilter(this.ndk, this.filter);
        }
        if (this.relaySet) {
          this.debug("querying relays");
          this.relaySet.subscribe(this);
        }
      }
      // EVENT handling
      eventFirstSeen = /* @__PURE__ */ new Map();
      /**
       * Called when an event is received from a relay or the cache
       * @param event
       * @param relay
       * @param fromCache Whether the event was received from the cache
       */
      eventReceived(event, relay, fromCache = false) {
        if (!fromCache && relay) {
          const eventAlreadySeen = this.eventFirstSeen.has(event.id);
          if (eventAlreadySeen) {
            const timeSinceFirstSeen = Date.now() - (this.eventFirstSeen.get(event.id) || 0);
            relay.scoreSlowerEvent(timeSinceFirstSeen);
            this.emit("event:dup", event, relay, timeSinceFirstSeen, this);
            return;
          }
          if (this.ndk.cacheAdapter) {
            this.ndk.cacheAdapter.setEvent(event, this.filter);
          }
          this.eventFirstSeen.set(`${event.id}`, Date.now());
        } else {
          this.eventFirstSeen.set(`${event.id}`, 0);
        }
        this.emit("event", event, relay, this);
      }
      // EOSE handling
      eosesSeen = /* @__PURE__ */ new Set();
      eoseTimeout;
      eoseReceived(relay) {
        if (this.opts?.closeOnEose) {
          this.relaySubscriptions.get(relay)?.unsub();
          this.relaySubscriptions.delete(relay);
          if (this.relaySubscriptions.size === 0) {
            this.emit("close", this);
          }
        }
        this.eosesSeen.add(relay);
        const hasSeenAllEoses = this.eosesSeen.size === this.relaySet?.size();
        if (hasSeenAllEoses) {
          this.emit("eose");
        } else {
          if (this.eoseTimeout) {
            clearTimeout(this.eoseTimeout);
          }
          this.eoseTimeout = setTimeout(() => {
            this.emit("eose");
          }, 500);
        }
      }
    };

    // src/events/dedup.ts
    function dedup(event1, event2) {
      if (event1.created_at > event2.created_at) {
        return event1;
      }
      return event2;
    }

    // src/signers/nip07/index.ts
    var NDKNip07Signer = class {
      _userPromise;
      constructor() {
        if (!window.nostr) {
          throw new Error("NIP-07 extension not available");
        }
      }
      async blockUntilReady() {
        const pubkey = await window.nostr?.getPublicKey();
        if (!pubkey) {
          throw new Error("User rejected access");
        }
        return new NDKUser({ hexpubkey: pubkey });
      }
      /**
       * Getter for the user property.
       * @returns The NDKUser instance.
       */
      async user() {
        if (!this._userPromise) {
          this._userPromise = this.blockUntilReady();
        }
        return this._userPromise;
      }
      /**
       * Signs the given Nostr event.
       * @param event - The Nostr event to be signed.
       * @returns The signature of the signed event.
       * @throws Error if the NIP-07 is not available on the window object.
       */
      async sign(event) {
        if (!window.nostr) {
          throw new Error("NIP-07 extension not available");
        }
        const signedEvent = await window.nostr.signEvent(event);
        return signedEvent.sig;
      }
    };

    // src/index.ts
    var NDK = class extends eventemitter3Exports {
      pool;
      signer;
      cacheAdapter;
      debug;
      constructor(opts = {}) {
        super();
        this.debug = opts.debug || browserExports("ndk");
        this.pool = new NDKPool(opts.explicitRelayUrls || [], this);
        this.signer = opts.signer;
        this.cacheAdapter = opts.cacheAdapter;
        this.debug("initialized", {
          relays: opts.explicitRelayUrls,
          signer: opts.signer?.constructor.name || "none",
          cacheAdapter: opts.cacheAdapter?.constructor.name || "none"
        });
      }
      /**
       * Connect to relays with optional timeout.
       * If the timeout is reached, the connection will be continued to be established in the background.
       */
      async connect(timeoutMs) {
        this.debug("Connecting to relays");
        return this.pool.connect(timeoutMs);
      }
      /**
       * Get a NDKUser object
       *
       * @param opts
       * @returns
       */
      getUser(opts) {
        const user = new NDKUser(opts);
        user.ndk = this;
        return user;
      }
      subscribe(filter, opts) {
        const subscription = new NDKSubscription(this, filter, opts);
        subscription.start();
        return subscription;
      }
      async publish(event) {
        const relaySet = calculateRelaySetFromEvent(this);
        return relaySet.publish(event);
      }
      /**
       * Fetch a single event
       */
      async fetchEvent(filter, opts = {}) {
        return new Promise((resolve) => {
          const s = this.subscribe(filter, { ...opts, closeOnEose: true });
          s.on("event", (event) => {
            event.ndk = this;
            resolve(event);
          });
        });
      }
      /**
       * Fetch events
       */
      async fetchEvents(filter, opts = {}) {
        return new Promise((resolve) => {
          const events = /* @__PURE__ */ new Map();
          const relaySetSubscription = this.subscribe(filter, { ...opts, closeOnEose: true });
          relaySetSubscription.on("event", (event) => {
            const existingEvent = events.get(event.tagId());
            if (existingEvent) {
              event = dedup(existingEvent, event);
            }
            event.ndk = this;
            events.set(event.tagId(), event);
          });
          relaySetSubscription.on("eose", () => {
            resolve(new Set(events.values()));
          });
        });
      }
      /**
       * Ensures that a signer is available to sign an event.
       */
      async assertSigner() {
        if (!this.signer) {
          this.emit("signerRequired");
          throw new Error("Signer required");
        }
      }
    };

    const ndk = writable(new NDK({
        explicitRelayUrls: ['ws://localhost:8080', 'wss://purplepag.es', 'wss://nos.lol']
    }));

    var eventsExports = {};
    var events = {
      get exports(){ return eventsExports; },
      set exports(v){ eventsExports = v; },
    };

    var R = typeof Reflect === 'object' ? Reflect : null;
    var ReflectApply = R && typeof R.apply === 'function'
      ? R.apply
      : function ReflectApply(target, receiver, args) {
        return Function.prototype.apply.call(target, receiver, args);
      };

    var ReflectOwnKeys;
    if (R && typeof R.ownKeys === 'function') {
      ReflectOwnKeys = R.ownKeys;
    } else if (Object.getOwnPropertySymbols) {
      ReflectOwnKeys = function ReflectOwnKeys(target) {
        return Object.getOwnPropertyNames(target)
          .concat(Object.getOwnPropertySymbols(target));
      };
    } else {
      ReflectOwnKeys = function ReflectOwnKeys(target) {
        return Object.getOwnPropertyNames(target);
      };
    }

    function ProcessEmitWarning(warning) {
      if (console && console.warn) console.warn(warning);
    }

    var NumberIsNaN = Number.isNaN || function NumberIsNaN(value) {
      return value !== value;
    };

    function EventEmitter() {
      EventEmitter.init.call(this);
    }
    events.exports = EventEmitter;
    eventsExports.once = once;

    // Backwards-compat with node 0.10.x
    EventEmitter.EventEmitter = EventEmitter;

    EventEmitter.prototype._events = undefined;
    EventEmitter.prototype._eventsCount = 0;
    EventEmitter.prototype._maxListeners = undefined;

    // By default EventEmitters will print a warning if more than 10 listeners are
    // added to it. This is a useful default which helps finding memory leaks.
    var defaultMaxListeners = 10;

    function checkListener(listener) {
      if (typeof listener !== 'function') {
        throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
      }
    }

    Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
      enumerable: true,
      get: function() {
        return defaultMaxListeners;
      },
      set: function(arg) {
        if (typeof arg !== 'number' || arg < 0 || NumberIsNaN(arg)) {
          throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + '.');
        }
        defaultMaxListeners = arg;
      }
    });

    EventEmitter.init = function() {

      if (this._events === undefined ||
          this._events === Object.getPrototypeOf(this)._events) {
        this._events = Object.create(null);
        this._eventsCount = 0;
      }

      this._maxListeners = this._maxListeners || undefined;
    };

    // Obviously not all Emitters should be limited to 10. This function allows
    // that to be increased. Set to zero for unlimited.
    EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
      if (typeof n !== 'number' || n < 0 || NumberIsNaN(n)) {
        throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + '.');
      }
      this._maxListeners = n;
      return this;
    };

    function _getMaxListeners(that) {
      if (that._maxListeners === undefined)
        return EventEmitter.defaultMaxListeners;
      return that._maxListeners;
    }

    EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
      return _getMaxListeners(this);
    };

    EventEmitter.prototype.emit = function emit(type) {
      var args = [];
      for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
      var doError = (type === 'error');

      var events = this._events;
      if (events !== undefined)
        doError = (doError && events.error === undefined);
      else if (!doError)
        return false;

      // If there is no 'error' event listener then throw.
      if (doError) {
        var er;
        if (args.length > 0)
          er = args[0];
        if (er instanceof Error) {
          // Note: The comments on the `throw` lines are intentional, they show
          // up in Node's output if this results in an unhandled exception.
          throw er; // Unhandled 'error' event
        }
        // At least give some kind of context to the user
        var err = new Error('Unhandled error.' + (er ? ' (' + er.message + ')' : ''));
        err.context = er;
        throw err; // Unhandled 'error' event
      }

      var handler = events[type];

      if (handler === undefined)
        return false;

      if (typeof handler === 'function') {
        ReflectApply(handler, this, args);
      } else {
        var len = handler.length;
        var listeners = arrayClone(handler, len);
        for (var i = 0; i < len; ++i)
          ReflectApply(listeners[i], this, args);
      }

      return true;
    };

    function _addListener(target, type, listener, prepend) {
      var m;
      var events;
      var existing;

      checkListener(listener);

      events = target._events;
      if (events === undefined) {
        events = target._events = Object.create(null);
        target._eventsCount = 0;
      } else {
        // To avoid recursion in the case that type === "newListener"! Before
        // adding it to the listeners, first emit "newListener".
        if (events.newListener !== undefined) {
          target.emit('newListener', type,
                      listener.listener ? listener.listener : listener);

          // Re-assign `events` because a newListener handler could have caused the
          // this._events to be assigned to a new object
          events = target._events;
        }
        existing = events[type];
      }

      if (existing === undefined) {
        // Optimize the case of one listener. Don't need the extra array object.
        existing = events[type] = listener;
        ++target._eventsCount;
      } else {
        if (typeof existing === 'function') {
          // Adding the second element, need to change to array.
          existing = events[type] =
            prepend ? [listener, existing] : [existing, listener];
          // If we've already got an array, just append.
        } else if (prepend) {
          existing.unshift(listener);
        } else {
          existing.push(listener);
        }

        // Check for listener leak
        m = _getMaxListeners(target);
        if (m > 0 && existing.length > m && !existing.warned) {
          existing.warned = true;
          // No error code for this since it is a Warning
          // eslint-disable-next-line no-restricted-syntax
          var w = new Error('Possible EventEmitter memory leak detected. ' +
                              existing.length + ' ' + String(type) + ' listeners ' +
                              'added. Use emitter.setMaxListeners() to ' +
                              'increase limit');
          w.name = 'MaxListenersExceededWarning';
          w.emitter = target;
          w.type = type;
          w.count = existing.length;
          ProcessEmitWarning(w);
        }
      }

      return target;
    }

    EventEmitter.prototype.addListener = function addListener(type, listener) {
      return _addListener(this, type, listener, false);
    };

    EventEmitter.prototype.on = EventEmitter.prototype.addListener;

    EventEmitter.prototype.prependListener =
        function prependListener(type, listener) {
          return _addListener(this, type, listener, true);
        };

    function onceWrapper() {
      if (!this.fired) {
        this.target.removeListener(this.type, this.wrapFn);
        this.fired = true;
        if (arguments.length === 0)
          return this.listener.call(this.target);
        return this.listener.apply(this.target, arguments);
      }
    }

    function _onceWrap(target, type, listener) {
      var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
      var wrapped = onceWrapper.bind(state);
      wrapped.listener = listener;
      state.wrapFn = wrapped;
      return wrapped;
    }

    EventEmitter.prototype.once = function once(type, listener) {
      checkListener(listener);
      this.on(type, _onceWrap(this, type, listener));
      return this;
    };

    EventEmitter.prototype.prependOnceListener =
        function prependOnceListener(type, listener) {
          checkListener(listener);
          this.prependListener(type, _onceWrap(this, type, listener));
          return this;
        };

    // Emits a 'removeListener' event if and only if the listener was removed.
    EventEmitter.prototype.removeListener =
        function removeListener(type, listener) {
          var list, events, position, i, originalListener;

          checkListener(listener);

          events = this._events;
          if (events === undefined)
            return this;

          list = events[type];
          if (list === undefined)
            return this;

          if (list === listener || list.listener === listener) {
            if (--this._eventsCount === 0)
              this._events = Object.create(null);
            else {
              delete events[type];
              if (events.removeListener)
                this.emit('removeListener', type, list.listener || listener);
            }
          } else if (typeof list !== 'function') {
            position = -1;

            for (i = list.length - 1; i >= 0; i--) {
              if (list[i] === listener || list[i].listener === listener) {
                originalListener = list[i].listener;
                position = i;
                break;
              }
            }

            if (position < 0)
              return this;

            if (position === 0)
              list.shift();
            else {
              spliceOne(list, position);
            }

            if (list.length === 1)
              events[type] = list[0];

            if (events.removeListener !== undefined)
              this.emit('removeListener', type, originalListener || listener);
          }

          return this;
        };

    EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

    EventEmitter.prototype.removeAllListeners =
        function removeAllListeners(type) {
          var listeners, events, i;

          events = this._events;
          if (events === undefined)
            return this;

          // not listening for removeListener, no need to emit
          if (events.removeListener === undefined) {
            if (arguments.length === 0) {
              this._events = Object.create(null);
              this._eventsCount = 0;
            } else if (events[type] !== undefined) {
              if (--this._eventsCount === 0)
                this._events = Object.create(null);
              else
                delete events[type];
            }
            return this;
          }

          // emit removeListener for all listeners on all events
          if (arguments.length === 0) {
            var keys = Object.keys(events);
            var key;
            for (i = 0; i < keys.length; ++i) {
              key = keys[i];
              if (key === 'removeListener') continue;
              this.removeAllListeners(key);
            }
            this.removeAllListeners('removeListener');
            this._events = Object.create(null);
            this._eventsCount = 0;
            return this;
          }

          listeners = events[type];

          if (typeof listeners === 'function') {
            this.removeListener(type, listeners);
          } else if (listeners !== undefined) {
            // LIFO order
            for (i = listeners.length - 1; i >= 0; i--) {
              this.removeListener(type, listeners[i]);
            }
          }

          return this;
        };

    function _listeners(target, type, unwrap) {
      var events = target._events;

      if (events === undefined)
        return [];

      var evlistener = events[type];
      if (evlistener === undefined)
        return [];

      if (typeof evlistener === 'function')
        return unwrap ? [evlistener.listener || evlistener] : [evlistener];

      return unwrap ?
        unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
    }

    EventEmitter.prototype.listeners = function listeners(type) {
      return _listeners(this, type, true);
    };

    EventEmitter.prototype.rawListeners = function rawListeners(type) {
      return _listeners(this, type, false);
    };

    EventEmitter.listenerCount = function(emitter, type) {
      if (typeof emitter.listenerCount === 'function') {
        return emitter.listenerCount(type);
      } else {
        return listenerCount.call(emitter, type);
      }
    };

    EventEmitter.prototype.listenerCount = listenerCount;
    function listenerCount(type) {
      var events = this._events;

      if (events !== undefined) {
        var evlistener = events[type];

        if (typeof evlistener === 'function') {
          return 1;
        } else if (evlistener !== undefined) {
          return evlistener.length;
        }
      }

      return 0;
    }

    EventEmitter.prototype.eventNames = function eventNames() {
      return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
    };

    function arrayClone(arr, n) {
      var copy = new Array(n);
      for (var i = 0; i < n; ++i)
        copy[i] = arr[i];
      return copy;
    }

    function spliceOne(list, index) {
      for (; index + 1 < list.length; index++)
        list[index] = list[index + 1];
      list.pop();
    }

    function unwrapListeners(arr) {
      var ret = new Array(arr.length);
      for (var i = 0; i < ret.length; ++i) {
        ret[i] = arr[i].listener || arr[i];
      }
      return ret;
    }

    function once(emitter, name) {
      return new Promise(function (resolve, reject) {
        function errorListener(err) {
          emitter.removeListener(name, resolver);
          reject(err);
        }

        function resolver() {
          if (typeof emitter.removeListener === 'function') {
            emitter.removeListener('error', errorListener);
          }
          resolve([].slice.call(arguments));
        }
        eventTargetAgnosticAddListener(emitter, name, resolver, { once: true });
        if (name !== 'error') {
          addErrorHandlerIfEventEmitter(emitter, errorListener, { once: true });
        }
      });
    }

    function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
      if (typeof emitter.on === 'function') {
        eventTargetAgnosticAddListener(emitter, 'error', handler, flags);
      }
    }

    function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
      if (typeof emitter.on === 'function') {
        if (flags.once) {
          emitter.once(name, listener);
        } else {
          emitter.on(name, listener);
        }
      } else if (typeof emitter.addEventListener === 'function') {
        // EventTarget does not have `error` event semantics like Node
        // EventEmitters, we do not listen for `error` events here.
        emitter.addEventListener(name, function wrapListener(arg) {
          // IE does not have builtin `{ once: true }` support so we
          // have to do it manually.
          if (flags.once) {
            emitter.removeEventListener(name, wrapListener);
          }
          listener(arg);
        });
      } else {
        throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter);
      }
    }

    function _regeneratorRuntime() {
      _regeneratorRuntime = function () {
        return exports;
      };
      var exports = {},
        Op = Object.prototype,
        hasOwn = Op.hasOwnProperty,
        defineProperty = Object.defineProperty || function (obj, key, desc) {
          obj[key] = desc.value;
        },
        $Symbol = "function" == typeof Symbol ? Symbol : {},
        iteratorSymbol = $Symbol.iterator || "@@iterator",
        asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator",
        toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag";
      function define(obj, key, value) {
        return Object.defineProperty(obj, key, {
          value: value,
          enumerable: !0,
          configurable: !0,
          writable: !0
        }), obj[key];
      }
      try {
        define({}, "");
      } catch (err) {
        define = function (obj, key, value) {
          return obj[key] = value;
        };
      }
      function wrap(innerFn, outerFn, self, tryLocsList) {
        var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator,
          generator = Object.create(protoGenerator.prototype),
          context = new Context(tryLocsList || []);
        return defineProperty(generator, "_invoke", {
          value: makeInvokeMethod(innerFn, self, context)
        }), generator;
      }
      function tryCatch(fn, obj, arg) {
        try {
          return {
            type: "normal",
            arg: fn.call(obj, arg)
          };
        } catch (err) {
          return {
            type: "throw",
            arg: err
          };
        }
      }
      exports.wrap = wrap;
      var ContinueSentinel = {};
      function Generator() {}
      function GeneratorFunction() {}
      function GeneratorFunctionPrototype() {}
      var IteratorPrototype = {};
      define(IteratorPrototype, iteratorSymbol, function () {
        return this;
      });
      var getProto = Object.getPrototypeOf,
        NativeIteratorPrototype = getProto && getProto(getProto(values([])));
      NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol) && (IteratorPrototype = NativeIteratorPrototype);
      var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype);
      function defineIteratorMethods(prototype) {
        ["next", "throw", "return"].forEach(function (method) {
          define(prototype, method, function (arg) {
            return this._invoke(method, arg);
          });
        });
      }
      function AsyncIterator(generator, PromiseImpl) {
        function invoke(method, arg, resolve, reject) {
          var record = tryCatch(generator[method], generator, arg);
          if ("throw" !== record.type) {
            var result = record.arg,
              value = result.value;
            return value && "object" == typeof value && hasOwn.call(value, "__await") ? PromiseImpl.resolve(value.__await).then(function (value) {
              invoke("next", value, resolve, reject);
            }, function (err) {
              invoke("throw", err, resolve, reject);
            }) : PromiseImpl.resolve(value).then(function (unwrapped) {
              result.value = unwrapped, resolve(result);
            }, function (error) {
              return invoke("throw", error, resolve, reject);
            });
          }
          reject(record.arg);
        }
        var previousPromise;
        defineProperty(this, "_invoke", {
          value: function (method, arg) {
            function callInvokeWithMethodAndArg() {
              return new PromiseImpl(function (resolve, reject) {
                invoke(method, arg, resolve, reject);
              });
            }
            return previousPromise = previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg();
          }
        });
      }
      function makeInvokeMethod(innerFn, self, context) {
        var state = "suspendedStart";
        return function (method, arg) {
          if ("executing" === state) throw new Error("Generator is already running");
          if ("completed" === state) {
            if ("throw" === method) throw arg;
            return doneResult();
          }
          for (context.method = method, context.arg = arg;;) {
            var delegate = context.delegate;
            if (delegate) {
              var delegateResult = maybeInvokeDelegate(delegate, context);
              if (delegateResult) {
                if (delegateResult === ContinueSentinel) continue;
                return delegateResult;
              }
            }
            if ("next" === context.method) context.sent = context._sent = context.arg;else if ("throw" === context.method) {
              if ("suspendedStart" === state) throw state = "completed", context.arg;
              context.dispatchException(context.arg);
            } else "return" === context.method && context.abrupt("return", context.arg);
            state = "executing";
            var record = tryCatch(innerFn, self, context);
            if ("normal" === record.type) {
              if (state = context.done ? "completed" : "suspendedYield", record.arg === ContinueSentinel) continue;
              return {
                value: record.arg,
                done: context.done
              };
            }
            "throw" === record.type && (state = "completed", context.method = "throw", context.arg = record.arg);
          }
        };
      }
      function maybeInvokeDelegate(delegate, context) {
        var methodName = context.method,
          method = delegate.iterator[methodName];
        if (undefined === method) return context.delegate = null, "throw" === methodName && delegate.iterator.return && (context.method = "return", context.arg = undefined, maybeInvokeDelegate(delegate, context), "throw" === context.method) || "return" !== methodName && (context.method = "throw", context.arg = new TypeError("The iterator does not provide a '" + methodName + "' method")), ContinueSentinel;
        var record = tryCatch(method, delegate.iterator, context.arg);
        if ("throw" === record.type) return context.method = "throw", context.arg = record.arg, context.delegate = null, ContinueSentinel;
        var info = record.arg;
        return info ? info.done ? (context[delegate.resultName] = info.value, context.next = delegate.nextLoc, "return" !== context.method && (context.method = "next", context.arg = undefined), context.delegate = null, ContinueSentinel) : info : (context.method = "throw", context.arg = new TypeError("iterator result is not an object"), context.delegate = null, ContinueSentinel);
      }
      function pushTryEntry(locs) {
        var entry = {
          tryLoc: locs[0]
        };
        1 in locs && (entry.catchLoc = locs[1]), 2 in locs && (entry.finallyLoc = locs[2], entry.afterLoc = locs[3]), this.tryEntries.push(entry);
      }
      function resetTryEntry(entry) {
        var record = entry.completion || {};
        record.type = "normal", delete record.arg, entry.completion = record;
      }
      function Context(tryLocsList) {
        this.tryEntries = [{
          tryLoc: "root"
        }], tryLocsList.forEach(pushTryEntry, this), this.reset(!0);
      }
      function values(iterable) {
        if (iterable) {
          var iteratorMethod = iterable[iteratorSymbol];
          if (iteratorMethod) return iteratorMethod.call(iterable);
          if ("function" == typeof iterable.next) return iterable;
          if (!isNaN(iterable.length)) {
            var i = -1,
              next = function next() {
                for (; ++i < iterable.length;) if (hasOwn.call(iterable, i)) return next.value = iterable[i], next.done = !1, next;
                return next.value = undefined, next.done = !0, next;
              };
            return next.next = next;
          }
        }
        return {
          next: doneResult
        };
      }
      function doneResult() {
        return {
          value: undefined,
          done: !0
        };
      }
      return GeneratorFunction.prototype = GeneratorFunctionPrototype, defineProperty(Gp, "constructor", {
        value: GeneratorFunctionPrototype,
        configurable: !0
      }), defineProperty(GeneratorFunctionPrototype, "constructor", {
        value: GeneratorFunction,
        configurable: !0
      }), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, "GeneratorFunction"), exports.isGeneratorFunction = function (genFun) {
        var ctor = "function" == typeof genFun && genFun.constructor;
        return !!ctor && (ctor === GeneratorFunction || "GeneratorFunction" === (ctor.displayName || ctor.name));
      }, exports.mark = function (genFun) {
        return Object.setPrototypeOf ? Object.setPrototypeOf(genFun, GeneratorFunctionPrototype) : (genFun.__proto__ = GeneratorFunctionPrototype, define(genFun, toStringTagSymbol, "GeneratorFunction")), genFun.prototype = Object.create(Gp), genFun;
      }, exports.awrap = function (arg) {
        return {
          __await: arg
        };
      }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, asyncIteratorSymbol, function () {
        return this;
      }), exports.AsyncIterator = AsyncIterator, exports.async = function (innerFn, outerFn, self, tryLocsList, PromiseImpl) {
        void 0 === PromiseImpl && (PromiseImpl = Promise);
        var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl);
        return exports.isGeneratorFunction(outerFn) ? iter : iter.next().then(function (result) {
          return result.done ? result.value : iter.next();
        });
      }, defineIteratorMethods(Gp), define(Gp, toStringTagSymbol, "Generator"), define(Gp, iteratorSymbol, function () {
        return this;
      }), define(Gp, "toString", function () {
        return "[object Generator]";
      }), exports.keys = function (val) {
        var object = Object(val),
          keys = [];
        for (var key in object) keys.push(key);
        return keys.reverse(), function next() {
          for (; keys.length;) {
            var key = keys.pop();
            if (key in object) return next.value = key, next.done = !1, next;
          }
          return next.done = !0, next;
        };
      }, exports.values = values, Context.prototype = {
        constructor: Context,
        reset: function (skipTempReset) {
          if (this.prev = 0, this.next = 0, this.sent = this._sent = undefined, this.done = !1, this.delegate = null, this.method = "next", this.arg = undefined, this.tryEntries.forEach(resetTryEntry), !skipTempReset) for (var name in this) "t" === name.charAt(0) && hasOwn.call(this, name) && !isNaN(+name.slice(1)) && (this[name] = undefined);
        },
        stop: function () {
          this.done = !0;
          var rootRecord = this.tryEntries[0].completion;
          if ("throw" === rootRecord.type) throw rootRecord.arg;
          return this.rval;
        },
        dispatchException: function (exception) {
          if (this.done) throw exception;
          var context = this;
          function handle(loc, caught) {
            return record.type = "throw", record.arg = exception, context.next = loc, caught && (context.method = "next", context.arg = undefined), !!caught;
          }
          for (var i = this.tryEntries.length - 1; i >= 0; --i) {
            var entry = this.tryEntries[i],
              record = entry.completion;
            if ("root" === entry.tryLoc) return handle("end");
            if (entry.tryLoc <= this.prev) {
              var hasCatch = hasOwn.call(entry, "catchLoc"),
                hasFinally = hasOwn.call(entry, "finallyLoc");
              if (hasCatch && hasFinally) {
                if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0);
                if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc);
              } else if (hasCatch) {
                if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0);
              } else {
                if (!hasFinally) throw new Error("try statement without catch or finally");
                if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc);
              }
            }
          }
        },
        abrupt: function (type, arg) {
          for (var i = this.tryEntries.length - 1; i >= 0; --i) {
            var entry = this.tryEntries[i];
            if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) {
              var finallyEntry = entry;
              break;
            }
          }
          finallyEntry && ("break" === type || "continue" === type) && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc && (finallyEntry = null);
          var record = finallyEntry ? finallyEntry.completion : {};
          return record.type = type, record.arg = arg, finallyEntry ? (this.method = "next", this.next = finallyEntry.finallyLoc, ContinueSentinel) : this.complete(record);
        },
        complete: function (record, afterLoc) {
          if ("throw" === record.type) throw record.arg;
          return "break" === record.type || "continue" === record.type ? this.next = record.arg : "return" === record.type ? (this.rval = this.arg = record.arg, this.method = "return", this.next = "end") : "normal" === record.type && afterLoc && (this.next = afterLoc), ContinueSentinel;
        },
        finish: function (finallyLoc) {
          for (var i = this.tryEntries.length - 1; i >= 0; --i) {
            var entry = this.tryEntries[i];
            if (entry.finallyLoc === finallyLoc) return this.complete(entry.completion, entry.afterLoc), resetTryEntry(entry), ContinueSentinel;
          }
        },
        catch: function (tryLoc) {
          for (var i = this.tryEntries.length - 1; i >= 0; --i) {
            var entry = this.tryEntries[i];
            if (entry.tryLoc === tryLoc) {
              var record = entry.completion;
              if ("throw" === record.type) {
                var thrown = record.arg;
                resetTryEntry(entry);
              }
              return thrown;
            }
          }
          throw new Error("illegal catch attempt");
        },
        delegateYield: function (iterable, resultName, nextLoc) {
          return this.delegate = {
            iterator: values(iterable),
            resultName: resultName,
            nextLoc: nextLoc
          }, "next" === this.method && (this.arg = undefined), ContinueSentinel;
        }
      }, exports;
    }
    function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
      try {
        var info = gen[key](arg);
        var value = info.value;
      } catch (error) {
        reject(error);
        return;
      }
      if (info.done) {
        resolve(value);
      } else {
        Promise.resolve(value).then(_next, _throw);
      }
    }
    function _asyncToGenerator(fn) {
      return function () {
        var self = this,
          args = arguments;
        return new Promise(function (resolve, reject) {
          var gen = fn.apply(self, args);
          function _next(value) {
            asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
          }
          function _throw(err) {
            asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
          }
          _next(undefined);
        });
      };
    }
    function _extends() {
      _extends = Object.assign ? Object.assign.bind() : function (target) {
        for (var i = 1; i < arguments.length; i++) {
          var source = arguments[i];
          for (var key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
              target[key] = source[key];
            }
          }
        }
        return target;
      };
      return _extends.apply(this, arguments);
    }

    var NostrRPC = /*#__PURE__*/function () {
      function NostrRPC(opts) {
        // events
        this.events = new eventsExports();
        this.relay = opts.relay || 'wss://nostr.vulpem.com';
        this.self = {
          pubkey: getPublicKey(opts.secretKey),
          secret: opts.secretKey
        };
      }
      var _proto = NostrRPC.prototype;
      _proto.call = /*#__PURE__*/function () {
        var _call = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3(_ref, opts) {
          var _this = this;
          var target, _ref$request, _ref$request$id, id, method, _ref$request$params, params, relay, request, event;
          return _regeneratorRuntime().wrap(function _callee3$(_context3) {
            while (1) switch (_context3.prev = _context3.next) {
              case 0:
                target = _ref.target, _ref$request = _ref.request, _ref$request$id = _ref$request.id, id = _ref$request$id === void 0 ? /*#__PURE__*/randomID() : _ref$request$id, method = _ref$request.method, _ref$request$params = _ref$request.params, params = _ref$request$params === void 0 ? [] : _ref$request$params;
                _context3.next = 3;
                return connectToRelay(this.relay);
              case 3:
                relay = _context3.sent;
                // prepare request to be sent
                request = prepareRequest(id, method, params);
                _context3.next = 7;
                return prepareEvent(this.self.secret, target, request);
              case 7:
                event = _context3.sent;
                return _context3.abrupt("return", new Promise( /*#__PURE__*/function () {
                  var _ref2 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(resolve, reject) {
                    var sub;
                    return _regeneratorRuntime().wrap(function _callee2$(_context2) {
                      while (1) switch (_context2.prev = _context2.next) {
                        case 0:
                          sub = relay.sub([{
                            kinds: [24133],
                            authors: [target],
                            '#p': [_this.self.pubkey],
                            limit: 1
                          }]);
                          _context2.next = 3;
                          return broadcastToRelay(relay, event, true);
                        case 3:
                          // skip waiting for response from remote
                          if (opts && opts.skipResponse === true) resolve();
                          sub.on('event', /*#__PURE__*/function () {
                            var _ref3 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(event) {
                              var payload, plaintext;
                              return _regeneratorRuntime().wrap(function _callee$(_context) {
                                while (1) switch (_context.prev = _context.next) {
                                  case 0:
                                    _context.prev = 0;
                                    _context.next = 3;
                                    return nip04_exports.decrypt(_this.self.secret, event.pubkey, event.content);
                                  case 3:
                                    plaintext = _context.sent;
                                    if (plaintext) {
                                      _context.next = 6;
                                      break;
                                    }
                                    throw new Error('failed to decrypt event');
                                  case 6:
                                    payload = JSON.parse(plaintext);
                                    _context.next = 12;
                                    break;
                                  case 9:
                                    _context.prev = 9;
                                    _context.t0 = _context["catch"](0);
                                    return _context.abrupt("return");
                                  case 12:
                                    if (isValidResponse(payload)) {
                                      _context.next = 14;
                                      break;
                                    }
                                    return _context.abrupt("return");
                                  case 14:
                                    if (!(payload.id !== id)) {
                                      _context.next = 16;
                                      break;
                                    }
                                    return _context.abrupt("return");
                                  case 16:
                                    // if the response is an error, reject the promise
                                    if (payload.error) {
                                      reject(payload.error);
                                    }
                                    // if the response is a result, resolve the promise
                                    if (payload.result) {
                                      resolve(payload.result);
                                    }
                                  case 18:
                                  case "end":
                                    return _context.stop();
                                }
                              }, _callee, null, [[0, 9]]);
                            }));
                            return function (_x5) {
                              return _ref3.apply(this, arguments);
                            };
                          }());
                        case 5:
                        case "end":
                          return _context2.stop();
                      }
                    }, _callee2);
                  }));
                  return function (_x3, _x4) {
                    return _ref2.apply(this, arguments);
                  };
                }()));
              case 9:
              case "end":
                return _context3.stop();
            }
          }, _callee3, this);
        }));
        function call(_x, _x2) {
          return _call.apply(this, arguments);
        }
        return call;
      }();
      _proto.listen = /*#__PURE__*/function () {
        var _listen = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee5() {
          var _this2 = this;
          var relay, sub;
          return _regeneratorRuntime().wrap(function _callee5$(_context5) {
            while (1) switch (_context5.prev = _context5.next) {
              case 0:
                _context5.next = 2;
                return connectToRelay(this.relay);
              case 2:
                relay = _context5.sent;
                sub = relay.sub([{
                  kinds: [24133],
                  '#p': [this.self.pubkey],
                  since: now()
                }]);
                sub.on('event', /*#__PURE__*/function () {
                  var _ref4 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee4(event) {
                    var payload, plaintext, response, body, responseEvent;
                    return _regeneratorRuntime().wrap(function _callee4$(_context4) {
                      while (1) switch (_context4.prev = _context4.next) {
                        case 0:
                          _context4.prev = 0;
                          _context4.next = 3;
                          return nip04_exports.decrypt(_this2.self.secret, event.pubkey, event.content);
                        case 3:
                          plaintext = _context4.sent;
                          if (plaintext) {
                            _context4.next = 6;
                            break;
                          }
                          throw new Error('failed to decrypt event');
                        case 6:
                          payload = JSON.parse(plaintext);
                          _context4.next = 12;
                          break;
                        case 9:
                          _context4.prev = 9;
                          _context4.t0 = _context4["catch"](0);
                          return _context4.abrupt("return");
                        case 12:
                          if (isValidRequest(payload)) {
                            _context4.next = 14;
                            break;
                          }
                          return _context4.abrupt("return");
                        case 14:
                          _context4.next = 17;
                          return _this2.handleRequest(payload, event);
                        case 17:
                          response = _context4.sent;
                          body = prepareResponse(response.id, response.result, response.error);
                          _context4.next = 21;
                          return prepareEvent(_this2.self.secret, event.pubkey, body);
                        case 21:
                          responseEvent = _context4.sent;
                          // send response via relay
                          relay.publish(responseEvent);
                        case 23:
                        case "end":
                          return _context4.stop();
                      }
                    }, _callee4, null, [[0, 9]]);
                  }));
                  return function (_x6) {
                    return _ref4.apply(this, arguments);
                  };
                }());
                return _context5.abrupt("return", sub);
              case 6:
              case "end":
                return _context5.stop();
            }
          }, _callee5, this);
        }));
        function listen() {
          return _listen.apply(this, arguments);
        }
        return listen;
      }();
      _proto.handleRequest = /*#__PURE__*/function () {
        var _handleRequest = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee6(request, event) {
          var id, method, params, result, error;
          return _regeneratorRuntime().wrap(function _callee6$(_context6) {
            while (1) switch (_context6.prev = _context6.next) {
              case 0:
                id = request.id, method = request.method, params = request.params;
                result = null;
                error = null;
                _context6.prev = 3;
                this.event = event;
                _context6.next = 7;
                return this[method].apply(this, params);
              case 7:
                result = _context6.sent;
                this.event = undefined;
                _context6.next = 14;
                break;
              case 11:
                _context6.prev = 11;
                _context6.t0 = _context6["catch"](3);
                if (_context6.t0 instanceof Error) {
                  error = _context6.t0.message;
                } else {
                  error = 'unknown error';
                }
              case 14:
                return _context6.abrupt("return", {
                  id: id,
                  result: result,
                  error: error
                });
              case 15:
              case "end":
                return _context6.stop();
            }
          }, _callee6, this, [[3, 11]]);
        }));
        function handleRequest(_x7, _x8) {
          return _handleRequest.apply(this, arguments);
        }
        return handleRequest;
      }();
      return NostrRPC;
    }();
    function now() {
      return Math.floor(Date.now() / 1000);
    }
    function randomID() {
      return Math.random().toString().slice(2);
    }
    function prepareRequest(id, method, params) {
      return JSON.stringify({
        id: id,
        method: method,
        params: params
      });
    }
    function prepareResponse(id, result, error) {
      return JSON.stringify({
        id: id,
        result: result,
        error: error
      });
    }
    function prepareEvent(_x9, _x10, _x11) {
      return _prepareEvent.apply(this, arguments);
    }
    function _prepareEvent() {
      _prepareEvent = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee7(secretKey, pubkey, content) {
        var cipherText, event, id, sig, signedEvent, ok, veryOk;
        return _regeneratorRuntime().wrap(function _callee7$(_context7) {
          while (1) switch (_context7.prev = _context7.next) {
            case 0:
              _context7.next = 2;
              return nip04_exports.encrypt(secretKey, pubkey, content);
            case 2:
              cipherText = _context7.sent;
              event = {
                kind: 24133,
                created_at: now(),
                pubkey: getPublicKey(secretKey),
                tags: [['p', pubkey]],
                content: cipherText
              };
              id = getEventHash(event);
              sig = signEvent(event, secretKey);
              signedEvent = _extends({}, event, {
                id: id,
                sig: sig
              });
              ok = validateEvent(signedEvent);
              veryOk = verifySignature(signedEvent);
              if (!(!ok || !veryOk)) {
                _context7.next = 11;
                break;
              }
              throw new Error('Event is not valid');
            case 11:
              return _context7.abrupt("return", signedEvent);
            case 12:
            case "end":
              return _context7.stop();
          }
        }, _callee7);
      }));
      return _prepareEvent.apply(this, arguments);
    }
    function isValidRequest(payload) {
      if (!payload) return false;
      var keys = Object.keys(payload);
      if (!keys.includes('id') || !keys.includes('method') || !keys.includes('params')) return false;
      return true;
    }
    function isValidResponse(payload) {
      if (!payload) return false;
      var keys = Object.keys(payload);
      if (!keys.includes('id') || !keys.includes('result') || !keys.includes('error')) return false;
      return true;
    }
    function connectToRelay(_x12) {
      return _connectToRelay.apply(this, arguments);
    }
    function _connectToRelay() {
      _connectToRelay = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee8(realayURL) {
        var relay;
        return _regeneratorRuntime().wrap(function _callee8$(_context8) {
          while (1) switch (_context8.prev = _context8.next) {
            case 0:
              relay = relayInit(realayURL);
              _context8.next = 3;
              return relay.connect();
            case 3:
              _context8.next = 5;
              return new Promise(function (resolve, reject) {
                relay.on('connect', function () {
                  resolve();
                });
                relay.on('error', function () {
                  reject(new Error("not possible to connect to " + relay.url));
                });
              });
            case 5:
              return _context8.abrupt("return", relay);
            case 6:
            case "end":
              return _context8.stop();
          }
        }, _callee8);
      }));
      return _connectToRelay.apply(this, arguments);
    }
    function broadcastToRelay(_x13, _x14, _x15) {
      return _broadcastToRelay.apply(this, arguments);
    }
    function _broadcastToRelay() {
      _broadcastToRelay = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee9(relay, event, skipSeen) {
        return _regeneratorRuntime().wrap(function _callee9$(_context9) {
          while (1) switch (_context9.prev = _context9.next) {
            case 0:
              if (skipSeen === void 0) {
                skipSeen = false;
              }
              _context9.next = 3;
              return new Promise(function (resolve, reject) {
                relay.on('error', function () {
                  reject(new Error("failed to connect to " + relay.url));
                });
                var pub = relay.publish(event);
                if (skipSeen) resolve();
                pub.on('failed', function (reason) {
                  reject(reason);
                });
                pub.on('seen', function () {
                  resolve();
                });
              });
            case 3:
              return _context9.abrupt("return", _context9.sent);
            case 4:
            case "end":
              return _context9.stop();
          }
        }, _callee9);
      }));
      return _broadcastToRelay.apply(this, arguments);
    }

    var ConnectURI = /*#__PURE__*/function () {
      function ConnectURI(_ref) {
        var target = _ref.target,
          metadata = _ref.metadata,
          relay = _ref.relay;
        this.target = target;
        this.metadata = metadata;
        this.relay = relay;
      }
      ConnectURI.fromURI = function fromURI(uri) {
        var url = new URL(uri);
        var target = url.hostname || url.pathname.substring(2);
        if (!target) throw new Error('Invalid connect URI: missing target');
        var relay = url.searchParams.get('relay');
        if (!relay) {
          throw new Error('Invalid connect URI: missing relay');
        }
        var metadata = url.searchParams.get('metadata');
        if (!metadata) {
          throw new Error('Invalid connect URI: missing metadata');
        }
        /* eslint-disable @typescript-eslint/no-unused-vars */
        try {
          var md = JSON.parse(metadata);
          return new ConnectURI({
            target: target,
            metadata: md,
            relay: relay
          });
        } catch (ignore) {
          throw new Error('Invalid connect URI: metadata is not valid JSON');
        }
      };
      var _proto = ConnectURI.prototype;
      _proto.toString = function toString() {
        return "nostrconnect://" + this.target + "?metadata=" + encodeURIComponent(JSON.stringify(this.metadata)) + "&relay=" + encodeURIComponent(this.relay);
      };
      _proto.approve = /*#__PURE__*/function () {
        var _approve = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(secretKey) {
          var rpc;
          return _regeneratorRuntime().wrap(function _callee$(_context) {
            while (1) switch (_context.prev = _context.next) {
              case 0:
                rpc = new NostrRPC({
                  relay: this.relay,
                  secretKey: secretKey
                });
                _context.next = 3;
                return rpc.call({
                  target: this.target,
                  request: {
                    method: 'connect',
                    params: [getPublicKey(secretKey)]
                  }
                }, {
                  skipResponse: true
                });
              case 3:
              case "end":
                return _context.stop();
            }
          }, _callee, this);
        }));
        function approve(_x) {
          return _approve.apply(this, arguments);
        }
        return approve;
      }();
      _proto.reject = /*#__PURE__*/function () {
        var _reject = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(secretKey) {
          var rpc;
          return _regeneratorRuntime().wrap(function _callee2$(_context2) {
            while (1) switch (_context2.prev = _context2.next) {
              case 0:
                rpc = new NostrRPC({
                  relay: this.relay,
                  secretKey: secretKey
                });
                _context2.next = 3;
                return rpc.call({
                  target: this.target,
                  request: {
                    method: 'disconnect',
                    params: []
                  }
                }, {
                  skipResponse: true
                });
              case 3:
              case "end":
                return _context2.stop();
            }
          }, _callee2, this);
        }));
        function reject(_x2) {
          return _reject.apply(this, arguments);
        }
        return reject;
      }();
      return ConnectURI;
    }();
    var Connect = /*#__PURE__*/function () {
      function Connect(_ref2) {
        var target = _ref2.target,
          relay = _ref2.relay,
          secretKey = _ref2.secretKey;
        this.events = new eventsExports();
        this.nip04 = {
          encrypt: function () {
            var _encrypt = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3(_pubkey, _plaintext) {
              return _regeneratorRuntime().wrap(function _callee3$(_context3) {
                while (1) switch (_context3.prev = _context3.next) {
                  case 0:
                    throw new Error('Not implemented');
                  case 1:
                  case "end":
                    return _context3.stop();
                }
              }, _callee3);
            }));
            function encrypt(_x3, _x4) {
              return _encrypt.apply(this, arguments);
            }
            return encrypt;
          }(),
          decrypt: function () {
            var _decrypt = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee4(_pubkey, _ciphertext) {
              return _regeneratorRuntime().wrap(function _callee4$(_context4) {
                while (1) switch (_context4.prev = _context4.next) {
                  case 0:
                    throw new Error('Not implemented');
                  case 1:
                  case "end":
                    return _context4.stop();
                }
              }, _callee4);
            }));
            function decrypt(_x5, _x6) {
              return _decrypt.apply(this, arguments);
            }
            return decrypt;
          }()
        };
        this.rpc = new NostrRPC({
          relay: relay,
          secretKey: secretKey
        });
        if (target) {
          this.target = target;
        }
      }
      var _proto2 = Connect.prototype;
      _proto2.init = /*#__PURE__*/function () {
        var _init = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee6() {
          var _this = this;
          var sub;
          return _regeneratorRuntime().wrap(function _callee6$(_context6) {
            while (1) switch (_context6.prev = _context6.next) {
              case 0:
                _context6.next = 2;
                return this.rpc.listen();
              case 2:
                sub = _context6.sent;
                sub.on('event', /*#__PURE__*/function () {
                  var _ref3 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee5(event) {
                    var payload, plaintext, _payload$params, pubkey;
                    return _regeneratorRuntime().wrap(function _callee5$(_context5) {
                      while (1) switch (_context5.prev = _context5.next) {
                        case 0:
                          _context5.prev = 0;
                          _context5.next = 3;
                          return nip04_exports.decrypt(_this.rpc.self.secret, event.pubkey, event.content);
                        case 3:
                          plaintext = _context5.sent;
                          if (plaintext) {
                            _context5.next = 6;
                            break;
                          }
                          throw new Error('failed to decrypt event');
                        case 6:
                          payload = JSON.parse(plaintext);
                          _context5.next = 12;
                          break;
                        case 9:
                          _context5.prev = 9;
                          _context5.t0 = _context5["catch"](0);
                          return _context5.abrupt("return");
                        case 12:
                          if (isValidRequest(payload)) {
                            _context5.next = 14;
                            break;
                          }
                          return _context5.abrupt("return");
                        case 14:
                          _context5.t1 = payload.method;
                          _context5.next = _context5.t1 === 'connect' ? 17 : _context5.t1 === 'disconnect' ? 23 : 26;
                          break;
                        case 17:
                          if (!(!payload.params || payload.params.length !== 1)) {
                            _context5.next = 19;
                            break;
                          }
                          throw new Error('connect: missing pubkey');
                        case 19:
                          _payload$params = payload.params, pubkey = _payload$params[0];
                          _this.target = pubkey;
                          _this.events.emit('connect', pubkey);
                          return _context5.abrupt("break", 26);
                        case 23:
                          _this.target = undefined;
                          _this.events.emit('disconnect');
                          return _context5.abrupt("break", 26);
                        case 26:
                        case "end":
                          return _context5.stop();
                      }
                    }, _callee5, null, [[0, 9]]);
                  }));
                  return function (_x7) {
                    return _ref3.apply(this, arguments);
                  };
                }());
              case 4:
              case "end":
                return _context6.stop();
            }
          }, _callee6, this);
        }));
        function init() {
          return _init.apply(this, arguments);
        }
        return init;
      }();
      _proto2.on = function on(evt, cb) {
        this.events.on(evt, cb);
      };
      _proto2.off = function off(evt, cb) {
        this.events.off(evt, cb);
      };
      _proto2.disconnect = /*#__PURE__*/function () {
        var _disconnect = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee7() {
          return _regeneratorRuntime().wrap(function _callee7$(_context7) {
            while (1) switch (_context7.prev = _context7.next) {
              case 0:
                if (this.target) {
                  _context7.next = 2;
                  break;
                }
                throw new Error('Not connected');
              case 2:
                // notify the UI that we are disconnecting
                this.events.emit('disconnect');
                _context7.prev = 3;
                _context7.next = 6;
                return this.rpc.call({
                  target: this.target,
                  request: {
                    method: 'disconnect',
                    params: []
                  }
                }, {
                  skipResponse: true
                });
              case 6:
                _context7.next = 11;
                break;
              case 8:
                _context7.prev = 8;
                _context7.t0 = _context7["catch"](3);
                throw new Error('Failed to disconnect');
              case 11:
                this.target = undefined;
              case 12:
              case "end":
                return _context7.stop();
            }
          }, _callee7, this, [[3, 8]]);
        }));
        function disconnect() {
          return _disconnect.apply(this, arguments);
        }
        return disconnect;
      }();
      _proto2.getPublicKey = /*#__PURE__*/function () {
        var _getPublicKey = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee8() {
          var response;
          return _regeneratorRuntime().wrap(function _callee8$(_context8) {
            while (1) switch (_context8.prev = _context8.next) {
              case 0:
                if (this.target) {
                  _context8.next = 2;
                  break;
                }
                throw new Error('Not connected');
              case 2:
                _context8.next = 4;
                return this.rpc.call({
                  target: this.target,
                  request: {
                    method: 'get_public_key',
                    params: []
                  }
                });
              case 4:
                response = _context8.sent;
                return _context8.abrupt("return", response);
              case 6:
              case "end":
                return _context8.stop();
            }
          }, _callee8, this);
        }));
        function getPublicKey() {
          return _getPublicKey.apply(this, arguments);
        }
        return getPublicKey;
      }();
      _proto2.signEvent = /*#__PURE__*/function () {
        var _signEvent = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee9(event) {
          var signature;
          return _regeneratorRuntime().wrap(function _callee9$(_context9) {
            while (1) switch (_context9.prev = _context9.next) {
              case 0:
                if (this.target) {
                  _context9.next = 2;
                  break;
                }
                throw new Error('Not connected');
              case 2:
                _context9.next = 4;
                return this.rpc.call({
                  target: this.target,
                  request: {
                    method: 'sign_event',
                    params: [event]
                  }
                });
              case 4:
                signature = _context9.sent;
                return _context9.abrupt("return", signature);
              case 6:
              case "end":
                return _context9.stop();
            }
          }, _callee9, this);
        }));
        function signEvent(_x8) {
          return _signEvent.apply(this, arguments);
        }
        return signEvent;
      }();
      _proto2.getRelays = /*#__PURE__*/function () {
        var _getRelays = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee10() {
          return _regeneratorRuntime().wrap(function _callee10$(_context10) {
            while (1) switch (_context10.prev = _context10.next) {
              case 0:
                throw new Error('Not implemented');
              case 1:
              case "end":
                return _context10.stop();
            }
          }, _callee10);
        }));
        function getRelays() {
          return _getRelays.apply(this, arguments);
        }
        return getRelays;
      }();
      return Connect;
    }();

    /* src/KeyPrompt.svelte generated by Svelte v3.58.0 */

    // (133:21) 
    function create_if_block_1$1(ctx) {
    	let div;
    	let t0;
    	let button0;
    	let t2;
    	let button1;
    	let mounted;
    	let dispose;
    	let if_block = /*hasNostrNip07*/ ctx[0] && create_if_block_2(ctx);

    	return {
    		c() {
    			div = element("div");
    			if (if_block) if_block.c();
    			t0 = space();
    			button0 = element("button");
    			button0.textContent = "Nostr Connect (NIP-46)";
    			t2 = space();
    			button1 = element("button");

    			button1.innerHTML = `Anonymous
            <span class="text-xs text-gray-300 svelte-wpu8if">(Ephemeral Keys)</span>`;

    			attr(button0, "class", "bg-purple-900 hover:bg-purple-700 w-full p-4 rounded-xl text-center font-regular text-gray-200  svelte-wpu8if");
    			attr(button1, "class", "bg-purple-900 hover:bg-purple-700 w-full p-4 rounded-xl text-center font-regular text-gray-200  svelte-wpu8if");
    			attr(div, "class", "flex flex-col gap-1 svelte-wpu8if");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			append(div, t0);
    			append(div, button0);
    			append(div, t2);
    			append(div, button1);

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", prevent_default(/*useNip46*/ ctx[3])),
    					listen(button1, "click", prevent_default(useDiscardableKeys))
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (/*hasNostrNip07*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_2(ctx);
    					if_block.c();
    					if_block.m(div, t0);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (111:0) {#if nip46URI}
    function create_if_block$2(ctx) {
    	let p;
    	let t1;
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			p = element("p");
    			p.textContent = "Scan this with your Nostr Connect (click to copy to clipboard)";
    			t1 = space();
    			button = element("button");
    			button.textContent = "Cancel";
    			attr(p, "class", "text-gray-600 mb-3 svelte-wpu8if");
    			attr(button, "class", "bg-purple-900 hover:bg-purple-700 w-full p-2 rounded-xl text-center font-regular text-white  svelte-wpu8if");
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    			insert(target, t1, anchor);
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", prevent_default(/*click_handler*/ ctx[4]));
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(p);
    			if (detaching) detach(t1);
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (135:8) {#if hasNostrNip07}
    function create_if_block_2(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			button.textContent = "Browser Extension (NIP-07)";
    			attr(button, "class", "bg-purple-900 hover:bg-purple-700 w-full p-4 rounded-xl text-center font-regular text-gray-200  svelte-wpu8if");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", prevent_default(/*useNip07*/ ctx[2]));
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$2(ctx) {
    	let h1;
    	let t1;
    	let t2;
    	let if_block1_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*nip46URI*/ ctx[1]) return create_if_block$2;
    		return create_if_block_1$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block1 = current_block_type && current_block_type(ctx);

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "How would you like to connect?";
    			t1 = space();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    			attr(h1, "class", "font-bold text-xl mb-3 svelte-wpu8if");
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    			insert(target, t1, anchor);
    			insert(target, t2, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    		},
    		p(ctx, [dirty]) {

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block1) {
    				if_block1.p(ctx, dirty);
    			} else {
    				if (if_block1) if_block1.d(1);
    				if_block1 = current_block_type && current_block_type(ctx);

    				if (if_block1) {
    					if_block1.c();
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(h1);
    			if (detaching) detach(t1);
    			if (detaching) detach(t2);

    			if (if_block1) {
    				if_block1.d(detaching);
    			}

    			if (detaching) detach(if_block1_anchor);
    		}
    	};
    }

    async function useDiscardableKeys() {
    	
    } // chatAdapter.set(new NstrAdapterDiscadableKeys(adapterConfig))

    function instance$2($$self, $$props, $$invalidate) {
    	let $ndk;
    	component_subscribe($$self, ndk, $$value => $$invalidate(5, $ndk = $$value));
    	let hasNostrNip07 = true;
    	let nip46URI;
    	let adapterConfig;

    	onMount(() => {
    		{
    			useNip07();
    		}
    	});

    	function useNip07() {
    		try {
    			set_store_value(ndk, $ndk.signer = new NDKNip07Signer(), $ndk);
    			$ndk.signer.user();
    		} catch(e) {
    			$$invalidate(0, hasNostrNip07 = false);
    			console.error(e);
    		}
    	}

    	async function useNip46() {
    		let key = localStorage.getItem('nostrichat-nostr-connect-key');
    		let publicKey = localStorage.getItem('nostrichat-nostr-connect-public-key');

    		if (key) {
    			chatAdapter.set(new NstrAdapterNip46(publicKey, key, adapterConfig));
    			return;
    		}

    		key = generatePrivateKey();

    		const connect = new Connect({
    				secretKey: key,
    				relay: 'wss://nostr.vulpem.com'
    			});

    		connect.events.on('connect', connectedPubKey => {
    			localStorage.setItem('nostrichat-nostr-connect-key', key);
    			localStorage.setItem('nostrichat-nostr-connect-public-key', connectedPubKey);
    			localStorage.setItem('nostrichat-type', 'nip-46');
    			console.log('connected to nostr connect relay');
    			publicKey = connectedPubKey;
    			chatAdapter.set(new NstrAdapterNip46(publicKey, key));
    			$$invalidate(1, nip46URI = null);
    		});

    		connect.events.on('disconnect', () => {
    			console.log('disconnected from nostr connect relay');
    		});

    		await connect.init();
    		let windowTitle, currentUrl, currentDomain;

    		try {
    			windowTitle = window.document.title || 'Nostrichat';
    			currentUrl = new URL(window.location.href);
    			currentDomain = currentUrl.hostname;
    		} catch(e) {
    			currentUrl = window.location.href;
    			currentDomain = currentUrl;
    		}

    		const connectURI = new ConnectURI({
    				target: getPublicKey(key),
    				relay: 'wss://nostr.vulpem.com',
    				metadata: {
    					name: windowTitle,
    					description: '🔉🔉🔉',
    					url: currentUrl
    				}
    			});

    		$$invalidate(1, nip46URI = connectURI.toString());
    	}

    	const click_handler = () => {
    		$$invalidate(1, nip46URI = null);
    	};

    	return [hasNostrNip07, nip46URI, useNip07, useNip46, click_handler];
    }

    class KeyPrompt extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});
    	}
    }

    var ReadabilityExports = {};
    var Readability$1 = {
      get exports(){ return ReadabilityExports; },
      set exports(v){ ReadabilityExports = v; },
    };

    /*
     * Copyright (c) 2010 Arc90 Inc
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *     http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */

    (function (module) {
    	/*
    	 * This code is heavily based on Arc90's readability.js (1.7.1) script
    	 * available at: http://code.google.com/p/arc90labs-readability
    	 */

    	/**
    	 * Public constructor.
    	 * @param {HTMLDocument} doc     The document to parse.
    	 * @param {Object}       options The options object.
    	 */
    	function Readability(doc, options) {
    	  // In some older versions, people passed a URI as the first argument. Cope:
    	  if (options && options.documentElement) {
    	    doc = options;
    	    options = arguments[2];
    	  } else if (!doc || !doc.documentElement) {
    	    throw new Error("First argument to Readability constructor should be a document object.");
    	  }
    	  options = options || {};

    	  this._doc = doc;
    	  this._docJSDOMParser = this._doc.firstChild.__JSDOMParser__;
    	  this._articleTitle = null;
    	  this._articleByline = null;
    	  this._articleDir = null;
    	  this._articleSiteName = null;
    	  this._attempts = [];

    	  // Configurable options
    	  this._debug = !!options.debug;
    	  this._maxElemsToParse = options.maxElemsToParse || this.DEFAULT_MAX_ELEMS_TO_PARSE;
    	  this._nbTopCandidates = options.nbTopCandidates || this.DEFAULT_N_TOP_CANDIDATES;
    	  this._charThreshold = options.charThreshold || this.DEFAULT_CHAR_THRESHOLD;
    	  this._classesToPreserve = this.CLASSES_TO_PRESERVE.concat(options.classesToPreserve || []);
    	  this._keepClasses = !!options.keepClasses;
    	  this._serializer = options.serializer || function(el) {
    	    return el.innerHTML;
    	  };
    	  this._disableJSONLD = !!options.disableJSONLD;
    	  this._allowedVideoRegex = options.allowedVideoRegex || this.REGEXPS.videos;

    	  // Start with all flags set
    	  this._flags = this.FLAG_STRIP_UNLIKELYS |
    	                this.FLAG_WEIGHT_CLASSES |
    	                this.FLAG_CLEAN_CONDITIONALLY;


    	  // Control whether log messages are sent to the console
    	  if (this._debug) {
    	    let logNode = function(node) {
    	      if (node.nodeType == node.TEXT_NODE) {
    	        return `${node.nodeName} ("${node.textContent}")`;
    	      }
    	      let attrPairs = Array.from(node.attributes || [], function(attr) {
    	        return `${attr.name}="${attr.value}"`;
    	      }).join(" ");
    	      return `<${node.localName} ${attrPairs}>`;
    	    };
    	    this.log = function () {
    	      if (typeof console !== "undefined") {
    	        let args = Array.from(arguments, arg => {
    	          if (arg && arg.nodeType == this.ELEMENT_NODE) {
    	            return logNode(arg);
    	          }
    	          return arg;
    	        });
    	        args.unshift("Reader: (Readability)");
    	        console.log.apply(console, args);
    	      } else if (typeof dump !== "undefined") {
    	        /* global dump */
    	        var msg = Array.prototype.map.call(arguments, function(x) {
    	          return (x && x.nodeName) ? logNode(x) : x;
    	        }).join(" ");
    	        dump("Reader: (Readability) " + msg + "\n");
    	      }
    	    };
    	  } else {
    	    this.log = function () {};
    	  }
    	}

    	Readability.prototype = {
    	  FLAG_STRIP_UNLIKELYS: 0x1,
    	  FLAG_WEIGHT_CLASSES: 0x2,
    	  FLAG_CLEAN_CONDITIONALLY: 0x4,

    	  // https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
    	  ELEMENT_NODE: 1,
    	  TEXT_NODE: 3,

    	  // Max number of nodes supported by this parser. Default: 0 (no limit)
    	  DEFAULT_MAX_ELEMS_TO_PARSE: 0,

    	  // The number of top candidates to consider when analysing how
    	  // tight the competition is among candidates.
    	  DEFAULT_N_TOP_CANDIDATES: 5,

    	  // Element tags to score by default.
    	  DEFAULT_TAGS_TO_SCORE: "section,h2,h3,h4,h5,h6,p,td,pre".toUpperCase().split(","),

    	  // The default number of chars an article must have in order to return a result
    	  DEFAULT_CHAR_THRESHOLD: 500,

    	  // All of the regular expressions in use within readability.
    	  // Defined up here so we don't instantiate them repeatedly in loops.
    	  REGEXPS: {
    	    // NOTE: These two regular expressions are duplicated in
    	    // Readability-readerable.js. Please keep both copies in sync.
    	    unlikelyCandidates: /-ad-|ai2html|banner|breadcrumbs|combx|comment|community|cover-wrap|disqus|extra|footer|gdpr|header|legends|menu|related|remark|replies|rss|shoutbox|sidebar|skyscraper|social|sponsor|supplemental|ad-break|agegate|pagination|pager|popup|yom-remote/i,
    	    okMaybeItsACandidate: /and|article|body|column|content|main|shadow/i,

    	    positive: /article|body|content|entry|hentry|h-entry|main|page|pagination|post|text|blog|story/i,
    	    negative: /-ad-|hidden|^hid$| hid$| hid |^hid |banner|combx|comment|com-|contact|foot|footer|footnote|gdpr|masthead|media|meta|outbrain|promo|related|scroll|share|shoutbox|sidebar|skyscraper|sponsor|shopping|tags|tool|widget/i,
    	    extraneous: /print|archive|comment|discuss|e[\-]?mail|share|reply|all|login|sign|single|utility/i,
    	    byline: /byline|author|dateline|writtenby|p-author/i,
    	    replaceFonts: /<(\/?)font[^>]*>/gi,
    	    normalize: /\s{2,}/g,
    	    videos: /\/\/(www\.)?((dailymotion|youtube|youtube-nocookie|player\.vimeo|v\.qq)\.com|(archive|upload\.wikimedia)\.org|player\.twitch\.tv)/i,
    	    shareElements: /(\b|_)(share|sharedaddy)(\b|_)/i,
    	    nextLink: /(next|weiter|continue|>([^\|]|$)|»([^\|]|$))/i,
    	    prevLink: /(prev|earl|old|new|<|«)/i,
    	    tokenize: /\W+/g,
    	    whitespace: /^\s*$/,
    	    hasContent: /\S$/,
    	    hashUrl: /^#.+/,
    	    srcsetUrl: /(\S+)(\s+[\d.]+[xw])?(\s*(?:,|$))/g,
    	    b64DataUrl: /^data:\s*([^\s;,]+)\s*;\s*base64\s*,/i,
    	    // See: https://schema.org/Article
    	    jsonLdArticleTypes: /^Article|AdvertiserContentArticle|NewsArticle|AnalysisNewsArticle|AskPublicNewsArticle|BackgroundNewsArticle|OpinionNewsArticle|ReportageNewsArticle|ReviewNewsArticle|Report|SatiricalArticle|ScholarlyArticle|MedicalScholarlyArticle|SocialMediaPosting|BlogPosting|LiveBlogPosting|DiscussionForumPosting|TechArticle|APIReference$/
    	  },

    	  UNLIKELY_ROLES: [ "menu", "menubar", "complementary", "navigation", "alert", "alertdialog", "dialog" ],

    	  DIV_TO_P_ELEMS: new Set([ "BLOCKQUOTE", "DL", "DIV", "IMG", "OL", "P", "PRE", "TABLE", "UL" ]),

    	  ALTER_TO_DIV_EXCEPTIONS: ["DIV", "ARTICLE", "SECTION", "P"],

    	  PRESENTATIONAL_ATTRIBUTES: [ "align", "background", "bgcolor", "border", "cellpadding", "cellspacing", "frame", "hspace", "rules", "style", "valign", "vspace" ],

    	  DEPRECATED_SIZE_ATTRIBUTE_ELEMS: [ "TABLE", "TH", "TD", "HR", "PRE" ],

    	  // The commented out elements qualify as phrasing content but tend to be
    	  // removed by readability when put into paragraphs, so we ignore them here.
    	  PHRASING_ELEMS: [
    	    // "CANVAS", "IFRAME", "SVG", "VIDEO",
    	    "ABBR", "AUDIO", "B", "BDO", "BR", "BUTTON", "CITE", "CODE", "DATA",
    	    "DATALIST", "DFN", "EM", "EMBED", "I", "IMG", "INPUT", "KBD", "LABEL",
    	    "MARK", "MATH", "METER", "NOSCRIPT", "OBJECT", "OUTPUT", "PROGRESS", "Q",
    	    "RUBY", "SAMP", "SCRIPT", "SELECT", "SMALL", "SPAN", "STRONG", "SUB",
    	    "SUP", "TEXTAREA", "TIME", "VAR", "WBR"
    	  ],

    	  // These are the classes that readability sets itself.
    	  CLASSES_TO_PRESERVE: [ "page" ],

    	  // These are the list of HTML entities that need to be escaped.
    	  HTML_ESCAPE_MAP: {
    	    "lt": "<",
    	    "gt": ">",
    	    "amp": "&",
    	    "quot": '"',
    	    "apos": "'",
    	  },

    	  /**
    	   * Run any post-process modifications to article content as necessary.
    	   *
    	   * @param Element
    	   * @return void
    	  **/
    	  _postProcessContent: function(articleContent) {
    	    // Readability cannot open relative uris so we convert them to absolute uris.
    	    this._fixRelativeUris(articleContent);

    	    this._simplifyNestedElements(articleContent);

    	    if (!this._keepClasses) {
    	      // Remove classes.
    	      this._cleanClasses(articleContent);
    	    }
    	  },

    	  /**
    	   * Iterates over a NodeList, calls `filterFn` for each node and removes node
    	   * if function returned `true`.
    	   *
    	   * If function is not passed, removes all the nodes in node list.
    	   *
    	   * @param NodeList nodeList The nodes to operate on
    	   * @param Function filterFn the function to use as a filter
    	   * @return void
    	   */
    	  _removeNodes: function(nodeList, filterFn) {
    	    // Avoid ever operating on live node lists.
    	    if (this._docJSDOMParser && nodeList._isLiveNodeList) {
    	      throw new Error("Do not pass live node lists to _removeNodes");
    	    }
    	    for (var i = nodeList.length - 1; i >= 0; i--) {
    	      var node = nodeList[i];
    	      var parentNode = node.parentNode;
    	      if (parentNode) {
    	        if (!filterFn || filterFn.call(this, node, i, nodeList)) {
    	          parentNode.removeChild(node);
    	        }
    	      }
    	    }
    	  },

    	  /**
    	   * Iterates over a NodeList, and calls _setNodeTag for each node.
    	   *
    	   * @param NodeList nodeList The nodes to operate on
    	   * @param String newTagName the new tag name to use
    	   * @return void
    	   */
    	  _replaceNodeTags: function(nodeList, newTagName) {
    	    // Avoid ever operating on live node lists.
    	    if (this._docJSDOMParser && nodeList._isLiveNodeList) {
    	      throw new Error("Do not pass live node lists to _replaceNodeTags");
    	    }
    	    for (const node of nodeList) {
    	      this._setNodeTag(node, newTagName);
    	    }
    	  },

    	  /**
    	   * Iterate over a NodeList, which doesn't natively fully implement the Array
    	   * interface.
    	   *
    	   * For convenience, the current object context is applied to the provided
    	   * iterate function.
    	   *
    	   * @param  NodeList nodeList The NodeList.
    	   * @param  Function fn       The iterate function.
    	   * @return void
    	   */
    	  _forEachNode: function(nodeList, fn) {
    	    Array.prototype.forEach.call(nodeList, fn, this);
    	  },

    	  /**
    	   * Iterate over a NodeList, and return the first node that passes
    	   * the supplied test function
    	   *
    	   * For convenience, the current object context is applied to the provided
    	   * test function.
    	   *
    	   * @param  NodeList nodeList The NodeList.
    	   * @param  Function fn       The test function.
    	   * @return void
    	   */
    	  _findNode: function(nodeList, fn) {
    	    return Array.prototype.find.call(nodeList, fn, this);
    	  },

    	  /**
    	   * Iterate over a NodeList, return true if any of the provided iterate
    	   * function calls returns true, false otherwise.
    	   *
    	   * For convenience, the current object context is applied to the
    	   * provided iterate function.
    	   *
    	   * @param  NodeList nodeList The NodeList.
    	   * @param  Function fn       The iterate function.
    	   * @return Boolean
    	   */
    	  _someNode: function(nodeList, fn) {
    	    return Array.prototype.some.call(nodeList, fn, this);
    	  },

    	  /**
    	   * Iterate over a NodeList, return true if all of the provided iterate
    	   * function calls return true, false otherwise.
    	   *
    	   * For convenience, the current object context is applied to the
    	   * provided iterate function.
    	   *
    	   * @param  NodeList nodeList The NodeList.
    	   * @param  Function fn       The iterate function.
    	   * @return Boolean
    	   */
    	  _everyNode: function(nodeList, fn) {
    	    return Array.prototype.every.call(nodeList, fn, this);
    	  },

    	  /**
    	   * Concat all nodelists passed as arguments.
    	   *
    	   * @return ...NodeList
    	   * @return Array
    	   */
    	  _concatNodeLists: function() {
    	    var slice = Array.prototype.slice;
    	    var args = slice.call(arguments);
    	    var nodeLists = args.map(function(list) {
    	      return slice.call(list);
    	    });
    	    return Array.prototype.concat.apply([], nodeLists);
    	  },

    	  _getAllNodesWithTag: function(node, tagNames) {
    	    if (node.querySelectorAll) {
    	      return node.querySelectorAll(tagNames.join(","));
    	    }
    	    return [].concat.apply([], tagNames.map(function(tag) {
    	      var collection = node.getElementsByTagName(tag);
    	      return Array.isArray(collection) ? collection : Array.from(collection);
    	    }));
    	  },

    	  /**
    	   * Removes the class="" attribute from every element in the given
    	   * subtree, except those that match CLASSES_TO_PRESERVE and
    	   * the classesToPreserve array from the options object.
    	   *
    	   * @param Element
    	   * @return void
    	   */
    	  _cleanClasses: function(node) {
    	    var classesToPreserve = this._classesToPreserve;
    	    var className = (node.getAttribute("class") || "")
    	      .split(/\s+/)
    	      .filter(function(cls) {
    	        return classesToPreserve.indexOf(cls) != -1;
    	      })
    	      .join(" ");

    	    if (className) {
    	      node.setAttribute("class", className);
    	    } else {
    	      node.removeAttribute("class");
    	    }

    	    for (node = node.firstElementChild; node; node = node.nextElementSibling) {
    	      this._cleanClasses(node);
    	    }
    	  },

    	  /**
    	   * Converts each <a> and <img> uri in the given element to an absolute URI,
    	   * ignoring #ref URIs.
    	   *
    	   * @param Element
    	   * @return void
    	   */
    	  _fixRelativeUris: function(articleContent) {
    	    var baseURI = this._doc.baseURI;
    	    var documentURI = this._doc.documentURI;
    	    function toAbsoluteURI(uri) {
    	      // Leave hash links alone if the base URI matches the document URI:
    	      if (baseURI == documentURI && uri.charAt(0) == "#") {
    	        return uri;
    	      }

    	      // Otherwise, resolve against base URI:
    	      try {
    	        return new URL(uri, baseURI).href;
    	      } catch (ex) {
    	        // Something went wrong, just return the original:
    	      }
    	      return uri;
    	    }

    	    var links = this._getAllNodesWithTag(articleContent, ["a"]);
    	    this._forEachNode(links, function(link) {
    	      var href = link.getAttribute("href");
    	      if (href) {
    	        // Remove links with javascript: URIs, since
    	        // they won't work after scripts have been removed from the page.
    	        if (href.indexOf("javascript:") === 0) {
    	          // if the link only contains simple text content, it can be converted to a text node
    	          if (link.childNodes.length === 1 && link.childNodes[0].nodeType === this.TEXT_NODE) {
    	            var text = this._doc.createTextNode(link.textContent);
    	            link.parentNode.replaceChild(text, link);
    	          } else {
    	            // if the link has multiple children, they should all be preserved
    	            var container = this._doc.createElement("span");
    	            while (link.firstChild) {
    	              container.appendChild(link.firstChild);
    	            }
    	            link.parentNode.replaceChild(container, link);
    	          }
    	        } else {
    	          link.setAttribute("href", toAbsoluteURI(href));
    	        }
    	      }
    	    });

    	    var medias = this._getAllNodesWithTag(articleContent, [
    	      "img", "picture", "figure", "video", "audio", "source"
    	    ]);

    	    this._forEachNode(medias, function(media) {
    	      var src = media.getAttribute("src");
    	      var poster = media.getAttribute("poster");
    	      var srcset = media.getAttribute("srcset");

    	      if (src) {
    	        media.setAttribute("src", toAbsoluteURI(src));
    	      }

    	      if (poster) {
    	        media.setAttribute("poster", toAbsoluteURI(poster));
    	      }

    	      if (srcset) {
    	        var newSrcset = srcset.replace(this.REGEXPS.srcsetUrl, function(_, p1, p2, p3) {
    	          return toAbsoluteURI(p1) + (p2 || "") + p3;
    	        });

    	        media.setAttribute("srcset", newSrcset);
    	      }
    	    });
    	  },

    	  _simplifyNestedElements: function(articleContent) {
    	    var node = articleContent;

    	    while (node) {
    	      if (node.parentNode && ["DIV", "SECTION"].includes(node.tagName) && !(node.id && node.id.startsWith("readability"))) {
    	        if (this._isElementWithoutContent(node)) {
    	          node = this._removeAndGetNext(node);
    	          continue;
    	        } else if (this._hasSingleTagInsideElement(node, "DIV") || this._hasSingleTagInsideElement(node, "SECTION")) {
    	          var child = node.children[0];
    	          for (var i = 0; i < node.attributes.length; i++) {
    	            child.setAttribute(node.attributes[i].name, node.attributes[i].value);
    	          }
    	          node.parentNode.replaceChild(child, node);
    	          node = child;
    	          continue;
    	        }
    	      }

    	      node = this._getNextNode(node);
    	    }
    	  },

    	  /**
    	   * Get the article title as an H1.
    	   *
    	   * @return string
    	   **/
    	  _getArticleTitle: function() {
    	    var doc = this._doc;
    	    var curTitle = "";
    	    var origTitle = "";

    	    try {
    	      curTitle = origTitle = doc.title.trim();

    	      // If they had an element with id "title" in their HTML
    	      if (typeof curTitle !== "string")
    	        curTitle = origTitle = this._getInnerText(doc.getElementsByTagName("title")[0]);
    	    } catch (e) {/* ignore exceptions setting the title. */}

    	    var titleHadHierarchicalSeparators = false;
    	    function wordCount(str) {
    	      return str.split(/\s+/).length;
    	    }

    	    // If there's a separator in the title, first remove the final part
    	    if ((/ [\|\-\\\/>»] /).test(curTitle)) {
    	      titleHadHierarchicalSeparators = / [\\\/>»] /.test(curTitle);
    	      curTitle = origTitle.replace(/(.*)[\|\-\\\/>»] .*/gi, "$1");

    	      // If the resulting title is too short (3 words or fewer), remove
    	      // the first part instead:
    	      if (wordCount(curTitle) < 3)
    	        curTitle = origTitle.replace(/[^\|\-\\\/>»]*[\|\-\\\/>»](.*)/gi, "$1");
    	    } else if (curTitle.indexOf(": ") !== -1) {
    	      // Check if we have an heading containing this exact string, so we
    	      // could assume it's the full title.
    	      var headings = this._concatNodeLists(
    	        doc.getElementsByTagName("h1"),
    	        doc.getElementsByTagName("h2")
    	      );
    	      var trimmedTitle = curTitle.trim();
    	      var match = this._someNode(headings, function(heading) {
    	        return heading.textContent.trim() === trimmedTitle;
    	      });

    	      // If we don't, let's extract the title out of the original title string.
    	      if (!match) {
    	        curTitle = origTitle.substring(origTitle.lastIndexOf(":") + 1);

    	        // If the title is now too short, try the first colon instead:
    	        if (wordCount(curTitle) < 3) {
    	          curTitle = origTitle.substring(origTitle.indexOf(":") + 1);
    	          // But if we have too many words before the colon there's something weird
    	          // with the titles and the H tags so let's just use the original title instead
    	        } else if (wordCount(origTitle.substr(0, origTitle.indexOf(":"))) > 5) {
    	          curTitle = origTitle;
    	        }
    	      }
    	    } else if (curTitle.length > 150 || curTitle.length < 15) {
    	      var hOnes = doc.getElementsByTagName("h1");

    	      if (hOnes.length === 1)
    	        curTitle = this._getInnerText(hOnes[0]);
    	    }

    	    curTitle = curTitle.trim().replace(this.REGEXPS.normalize, " ");
    	    // If we now have 4 words or fewer as our title, and either no
    	    // 'hierarchical' separators (\, /, > or ») were found in the original
    	    // title or we decreased the number of words by more than 1 word, use
    	    // the original title.
    	    var curTitleWordCount = wordCount(curTitle);
    	    if (curTitleWordCount <= 4 &&
    	        (!titleHadHierarchicalSeparators ||
    	         curTitleWordCount != wordCount(origTitle.replace(/[\|\-\\\/>»]+/g, "")) - 1)) {
    	      curTitle = origTitle;
    	    }

    	    return curTitle;
    	  },

    	  /**
    	   * Prepare the HTML document for readability to scrape it.
    	   * This includes things like stripping javascript, CSS, and handling terrible markup.
    	   *
    	   * @return void
    	   **/
    	  _prepDocument: function() {
    	    var doc = this._doc;

    	    // Remove all style tags in head
    	    this._removeNodes(this._getAllNodesWithTag(doc, ["style"]));

    	    if (doc.body) {
    	      this._replaceBrs(doc.body);
    	    }

    	    this._replaceNodeTags(this._getAllNodesWithTag(doc, ["font"]), "SPAN");
    	  },

    	  /**
    	   * Finds the next node, starting from the given node, and ignoring
    	   * whitespace in between. If the given node is an element, the same node is
    	   * returned.
    	   */
    	  _nextNode: function (node) {
    	    var next = node;
    	    while (next
    	        && (next.nodeType != this.ELEMENT_NODE)
    	        && this.REGEXPS.whitespace.test(next.textContent)) {
    	      next = next.nextSibling;
    	    }
    	    return next;
    	  },

    	  /**
    	   * Replaces 2 or more successive <br> elements with a single <p>.
    	   * Whitespace between <br> elements are ignored. For example:
    	   *   <div>foo<br>bar<br> <br><br>abc</div>
    	   * will become:
    	   *   <div>foo<br>bar<p>abc</p></div>
    	   */
    	  _replaceBrs: function (elem) {
    	    this._forEachNode(this._getAllNodesWithTag(elem, ["br"]), function(br) {
    	      var next = br.nextSibling;

    	      // Whether 2 or more <br> elements have been found and replaced with a
    	      // <p> block.
    	      var replaced = false;

    	      // If we find a <br> chain, remove the <br>s until we hit another node
    	      // or non-whitespace. This leaves behind the first <br> in the chain
    	      // (which will be replaced with a <p> later).
    	      while ((next = this._nextNode(next)) && (next.tagName == "BR")) {
    	        replaced = true;
    	        var brSibling = next.nextSibling;
    	        next.parentNode.removeChild(next);
    	        next = brSibling;
    	      }

    	      // If we removed a <br> chain, replace the remaining <br> with a <p>. Add
    	      // all sibling nodes as children of the <p> until we hit another <br>
    	      // chain.
    	      if (replaced) {
    	        var p = this._doc.createElement("p");
    	        br.parentNode.replaceChild(p, br);

    	        next = p.nextSibling;
    	        while (next) {
    	          // If we've hit another <br><br>, we're done adding children to this <p>.
    	          if (next.tagName == "BR") {
    	            var nextElem = this._nextNode(next.nextSibling);
    	            if (nextElem && nextElem.tagName == "BR")
    	              break;
    	          }

    	          if (!this._isPhrasingContent(next))
    	            break;

    	          // Otherwise, make this node a child of the new <p>.
    	          var sibling = next.nextSibling;
    	          p.appendChild(next);
    	          next = sibling;
    	        }

    	        while (p.lastChild && this._isWhitespace(p.lastChild)) {
    	          p.removeChild(p.lastChild);
    	        }

    	        if (p.parentNode.tagName === "P")
    	          this._setNodeTag(p.parentNode, "DIV");
    	      }
    	    });
    	  },

    	  _setNodeTag: function (node, tag) {
    	    this.log("_setNodeTag", node, tag);
    	    if (this._docJSDOMParser) {
    	      node.localName = tag.toLowerCase();
    	      node.tagName = tag.toUpperCase();
    	      return node;
    	    }

    	    var replacement = node.ownerDocument.createElement(tag);
    	    while (node.firstChild) {
    	      replacement.appendChild(node.firstChild);
    	    }
    	    node.parentNode.replaceChild(replacement, node);
    	    if (node.readability)
    	      replacement.readability = node.readability;

    	    for (var i = 0; i < node.attributes.length; i++) {
    	      try {
    	        replacement.setAttribute(node.attributes[i].name, node.attributes[i].value);
    	      } catch (ex) {
    	        /* it's possible for setAttribute() to throw if the attribute name
    	         * isn't a valid XML Name. Such attributes can however be parsed from
    	         * source in HTML docs, see https://github.com/whatwg/html/issues/4275,
    	         * so we can hit them here and then throw. We don't care about such
    	         * attributes so we ignore them.
    	         */
    	      }
    	    }
    	    return replacement;
    	  },

    	  /**
    	   * Prepare the article node for display. Clean out any inline styles,
    	   * iframes, forms, strip extraneous <p> tags, etc.
    	   *
    	   * @param Element
    	   * @return void
    	   **/
    	  _prepArticle: function(articleContent) {
    	    this._cleanStyles(articleContent);

    	    // Check for data tables before we continue, to avoid removing items in
    	    // those tables, which will often be isolated even though they're
    	    // visually linked to other content-ful elements (text, images, etc.).
    	    this._markDataTables(articleContent);

    	    this._fixLazyImages(articleContent);

    	    // Clean out junk from the article content
    	    this._cleanConditionally(articleContent, "form");
    	    this._cleanConditionally(articleContent, "fieldset");
    	    this._clean(articleContent, "object");
    	    this._clean(articleContent, "embed");
    	    this._clean(articleContent, "footer");
    	    this._clean(articleContent, "link");
    	    this._clean(articleContent, "aside");

    	    // Clean out elements with little content that have "share" in their id/class combinations from final top candidates,
    	    // which means we don't remove the top candidates even they have "share".

    	    var shareElementThreshold = this.DEFAULT_CHAR_THRESHOLD;

    	    this._forEachNode(articleContent.children, function (topCandidate) {
    	      this._cleanMatchedNodes(topCandidate, function (node, matchString) {
    	        return this.REGEXPS.shareElements.test(matchString) && node.textContent.length < shareElementThreshold;
    	      });
    	    });

    	    this._clean(articleContent, "iframe");
    	    this._clean(articleContent, "input");
    	    this._clean(articleContent, "textarea");
    	    this._clean(articleContent, "select");
    	    this._clean(articleContent, "button");
    	    this._cleanHeaders(articleContent);

    	    // Do these last as the previous stuff may have removed junk
    	    // that will affect these
    	    this._cleanConditionally(articleContent, "table");
    	    this._cleanConditionally(articleContent, "ul");
    	    this._cleanConditionally(articleContent, "div");

    	    // replace H1 with H2 as H1 should be only title that is displayed separately
    	    this._replaceNodeTags(this._getAllNodesWithTag(articleContent, ["h1"]), "h2");

    	    // Remove extra paragraphs
    	    this._removeNodes(this._getAllNodesWithTag(articleContent, ["p"]), function (paragraph) {
    	      var imgCount = paragraph.getElementsByTagName("img").length;
    	      var embedCount = paragraph.getElementsByTagName("embed").length;
    	      var objectCount = paragraph.getElementsByTagName("object").length;
    	      // At this point, nasty iframes have been removed, only remain embedded video ones.
    	      var iframeCount = paragraph.getElementsByTagName("iframe").length;
    	      var totalCount = imgCount + embedCount + objectCount + iframeCount;

    	      return totalCount === 0 && !this._getInnerText(paragraph, false);
    	    });

    	    this._forEachNode(this._getAllNodesWithTag(articleContent, ["br"]), function(br) {
    	      var next = this._nextNode(br.nextSibling);
    	      if (next && next.tagName == "P")
    	        br.parentNode.removeChild(br);
    	    });

    	    // Remove single-cell tables
    	    this._forEachNode(this._getAllNodesWithTag(articleContent, ["table"]), function(table) {
    	      var tbody = this._hasSingleTagInsideElement(table, "TBODY") ? table.firstElementChild : table;
    	      if (this._hasSingleTagInsideElement(tbody, "TR")) {
    	        var row = tbody.firstElementChild;
    	        if (this._hasSingleTagInsideElement(row, "TD")) {
    	          var cell = row.firstElementChild;
    	          cell = this._setNodeTag(cell, this._everyNode(cell.childNodes, this._isPhrasingContent) ? "P" : "DIV");
    	          table.parentNode.replaceChild(cell, table);
    	        }
    	      }
    	    });
    	  },

    	  /**
    	   * Initialize a node with the readability object. Also checks the
    	   * className/id for special names to add to its score.
    	   *
    	   * @param Element
    	   * @return void
    	  **/
    	  _initializeNode: function(node) {
    	    node.readability = {"contentScore": 0};

    	    switch (node.tagName) {
    	      case "DIV":
    	        node.readability.contentScore += 5;
    	        break;

    	      case "PRE":
    	      case "TD":
    	      case "BLOCKQUOTE":
    	        node.readability.contentScore += 3;
    	        break;

    	      case "ADDRESS":
    	      case "OL":
    	      case "UL":
    	      case "DL":
    	      case "DD":
    	      case "DT":
    	      case "LI":
    	      case "FORM":
    	        node.readability.contentScore -= 3;
    	        break;

    	      case "H1":
    	      case "H2":
    	      case "H3":
    	      case "H4":
    	      case "H5":
    	      case "H6":
    	      case "TH":
    	        node.readability.contentScore -= 5;
    	        break;
    	    }

    	    node.readability.contentScore += this._getClassWeight(node);
    	  },

    	  _removeAndGetNext: function(node) {
    	    var nextNode = this._getNextNode(node, true);
    	    node.parentNode.removeChild(node);
    	    return nextNode;
    	  },

    	  /**
    	   * Traverse the DOM from node to node, starting at the node passed in.
    	   * Pass true for the second parameter to indicate this node itself
    	   * (and its kids) are going away, and we want the next node over.
    	   *
    	   * Calling this in a loop will traverse the DOM depth-first.
    	   */
    	  _getNextNode: function(node, ignoreSelfAndKids) {
    	    // First check for kids if those aren't being ignored
    	    if (!ignoreSelfAndKids && node.firstElementChild) {
    	      return node.firstElementChild;
    	    }
    	    // Then for siblings...
    	    if (node.nextElementSibling) {
    	      return node.nextElementSibling;
    	    }
    	    // And finally, move up the parent chain *and* find a sibling
    	    // (because this is depth-first traversal, we will have already
    	    // seen the parent nodes themselves).
    	    do {
    	      node = node.parentNode;
    	    } while (node && !node.nextElementSibling);
    	    return node && node.nextElementSibling;
    	  },

    	  // compares second text to first one
    	  // 1 = same text, 0 = completely different text
    	  // works the way that it splits both texts into words and then finds words that are unique in second text
    	  // the result is given by the lower length of unique parts
    	  _textSimilarity: function(textA, textB) {
    	    var tokensA = textA.toLowerCase().split(this.REGEXPS.tokenize).filter(Boolean);
    	    var tokensB = textB.toLowerCase().split(this.REGEXPS.tokenize).filter(Boolean);
    	    if (!tokensA.length || !tokensB.length) {
    	      return 0;
    	    }
    	    var uniqTokensB = tokensB.filter(token => !tokensA.includes(token));
    	    var distanceB = uniqTokensB.join(" ").length / tokensB.join(" ").length;
    	    return 1 - distanceB;
    	  },

    	  _checkByline: function(node, matchString) {
    	    if (this._articleByline) {
    	      return false;
    	    }

    	    if (node.getAttribute !== undefined) {
    	      var rel = node.getAttribute("rel");
    	      var itemprop = node.getAttribute("itemprop");
    	    }

    	    if ((rel === "author" || (itemprop && itemprop.indexOf("author") !== -1) || this.REGEXPS.byline.test(matchString)) && this._isValidByline(node.textContent)) {
    	      this._articleByline = node.textContent.trim();
    	      return true;
    	    }

    	    return false;
    	  },

    	  _getNodeAncestors: function(node, maxDepth) {
    	    maxDepth = maxDepth || 0;
    	    var i = 0, ancestors = [];
    	    while (node.parentNode) {
    	      ancestors.push(node.parentNode);
    	      if (maxDepth && ++i === maxDepth)
    	        break;
    	      node = node.parentNode;
    	    }
    	    return ancestors;
    	  },

    	  /***
    	   * grabArticle - Using a variety of metrics (content score, classname, element types), find the content that is
    	   *         most likely to be the stuff a user wants to read. Then return it wrapped up in a div.
    	   *
    	   * @param page a document to run upon. Needs to be a full document, complete with body.
    	   * @return Element
    	  **/
    	  _grabArticle: function (page) {
    	    this.log("**** grabArticle ****");
    	    var doc = this._doc;
    	    var isPaging = page !== null;
    	    page = page ? page : this._doc.body;

    	    // We can't grab an article if we don't have a page!
    	    if (!page) {
    	      this.log("No body found in document. Abort.");
    	      return null;
    	    }

    	    var pageCacheHtml = page.innerHTML;

    	    while (true) {
    	      this.log("Starting grabArticle loop");
    	      var stripUnlikelyCandidates = this._flagIsActive(this.FLAG_STRIP_UNLIKELYS);

    	      // First, node prepping. Trash nodes that look cruddy (like ones with the
    	      // class name "comment", etc), and turn divs into P tags where they have been
    	      // used inappropriately (as in, where they contain no other block level elements.)
    	      var elementsToScore = [];
    	      var node = this._doc.documentElement;

    	      let shouldRemoveTitleHeader = true;

    	      while (node) {

    	        if (node.tagName === "HTML") {
    	          this._articleLang = node.getAttribute("lang");
    	        }

    	        var matchString = node.className + " " + node.id;

    	        if (!this._isProbablyVisible(node)) {
    	          this.log("Removing hidden node - " + matchString);
    	          node = this._removeAndGetNext(node);
    	          continue;
    	        }

    	        // User is not able to see elements applied with both "aria-modal = true" and "role = dialog"
    	        if (node.getAttribute("aria-modal") == "true" && node.getAttribute("role") == "dialog") {
    	          node = this._removeAndGetNext(node);
    	          continue;
    	        }

    	        // Check to see if this node is a byline, and remove it if it is.
    	        if (this._checkByline(node, matchString)) {
    	          node = this._removeAndGetNext(node);
    	          continue;
    	        }

    	        if (shouldRemoveTitleHeader && this._headerDuplicatesTitle(node)) {
    	          this.log("Removing header: ", node.textContent.trim(), this._articleTitle.trim());
    	          shouldRemoveTitleHeader = false;
    	          node = this._removeAndGetNext(node);
    	          continue;
    	        }

    	        // Remove unlikely candidates
    	        if (stripUnlikelyCandidates) {
    	          if (this.REGEXPS.unlikelyCandidates.test(matchString) &&
    	              !this.REGEXPS.okMaybeItsACandidate.test(matchString) &&
    	              !this._hasAncestorTag(node, "table") &&
    	              !this._hasAncestorTag(node, "code") &&
    	              node.tagName !== "BODY" &&
    	              node.tagName !== "A") {
    	            this.log("Removing unlikely candidate - " + matchString);
    	            node = this._removeAndGetNext(node);
    	            continue;
    	          }

    	          if (this.UNLIKELY_ROLES.includes(node.getAttribute("role"))) {
    	            this.log("Removing content with role " + node.getAttribute("role") + " - " + matchString);
    	            node = this._removeAndGetNext(node);
    	            continue;
    	          }
    	        }

    	        // Remove DIV, SECTION, and HEADER nodes without any content(e.g. text, image, video, or iframe).
    	        if ((node.tagName === "DIV" || node.tagName === "SECTION" || node.tagName === "HEADER" ||
    	             node.tagName === "H1" || node.tagName === "H2" || node.tagName === "H3" ||
    	             node.tagName === "H4" || node.tagName === "H5" || node.tagName === "H6") &&
    	            this._isElementWithoutContent(node)) {
    	          node = this._removeAndGetNext(node);
    	          continue;
    	        }

    	        if (this.DEFAULT_TAGS_TO_SCORE.indexOf(node.tagName) !== -1) {
    	          elementsToScore.push(node);
    	        }

    	        // Turn all divs that don't have children block level elements into p's
    	        if (node.tagName === "DIV") {
    	          // Put phrasing content into paragraphs.
    	          var p = null;
    	          var childNode = node.firstChild;
    	          while (childNode) {
    	            var nextSibling = childNode.nextSibling;
    	            if (this._isPhrasingContent(childNode)) {
    	              if (p !== null) {
    	                p.appendChild(childNode);
    	              } else if (!this._isWhitespace(childNode)) {
    	                p = doc.createElement("p");
    	                node.replaceChild(p, childNode);
    	                p.appendChild(childNode);
    	              }
    	            } else if (p !== null) {
    	              while (p.lastChild && this._isWhitespace(p.lastChild)) {
    	                p.removeChild(p.lastChild);
    	              }
    	              p = null;
    	            }
    	            childNode = nextSibling;
    	          }

    	          // Sites like http://mobile.slate.com encloses each paragraph with a DIV
    	          // element. DIVs with only a P element inside and no text content can be
    	          // safely converted into plain P elements to avoid confusing the scoring
    	          // algorithm with DIVs with are, in practice, paragraphs.
    	          if (this._hasSingleTagInsideElement(node, "P") && this._getLinkDensity(node) < 0.25) {
    	            var newNode = node.children[0];
    	            node.parentNode.replaceChild(newNode, node);
    	            node = newNode;
    	            elementsToScore.push(node);
    	          } else if (!this._hasChildBlockElement(node)) {
    	            node = this._setNodeTag(node, "P");
    	            elementsToScore.push(node);
    	          }
    	        }
    	        node = this._getNextNode(node);
    	      }

    	      /**
    	       * Loop through all paragraphs, and assign a score to them based on how content-y they look.
    	       * Then add their score to their parent node.
    	       *
    	       * A score is determined by things like number of commas, class names, etc. Maybe eventually link density.
    	      **/
    	      var candidates = [];
    	      this._forEachNode(elementsToScore, function(elementToScore) {
    	        if (!elementToScore.parentNode || typeof(elementToScore.parentNode.tagName) === "undefined")
    	          return;

    	        // If this paragraph is less than 25 characters, don't even count it.
    	        var innerText = this._getInnerText(elementToScore);
    	        if (innerText.length < 25)
    	          return;

    	        // Exclude nodes with no ancestor.
    	        var ancestors = this._getNodeAncestors(elementToScore, 5);
    	        if (ancestors.length === 0)
    	          return;

    	        var contentScore = 0;

    	        // Add a point for the paragraph itself as a base.
    	        contentScore += 1;

    	        // Add points for any commas within this paragraph.
    	        contentScore += innerText.split(",").length;

    	        // For every 100 characters in this paragraph, add another point. Up to 3 points.
    	        contentScore += Math.min(Math.floor(innerText.length / 100), 3);

    	        // Initialize and score ancestors.
    	        this._forEachNode(ancestors, function(ancestor, level) {
    	          if (!ancestor.tagName || !ancestor.parentNode || typeof(ancestor.parentNode.tagName) === "undefined")
    	            return;

    	          if (typeof(ancestor.readability) === "undefined") {
    	            this._initializeNode(ancestor);
    	            candidates.push(ancestor);
    	          }

    	          // Node score divider:
    	          // - parent:             1 (no division)
    	          // - grandparent:        2
    	          // - great grandparent+: ancestor level * 3
    	          if (level === 0)
    	            var scoreDivider = 1;
    	          else if (level === 1)
    	            scoreDivider = 2;
    	          else
    	            scoreDivider = level * 3;
    	          ancestor.readability.contentScore += contentScore / scoreDivider;
    	        });
    	      });

    	      // After we've calculated scores, loop through all of the possible
    	      // candidate nodes we found and find the one with the highest score.
    	      var topCandidates = [];
    	      for (var c = 0, cl = candidates.length; c < cl; c += 1) {
    	        var candidate = candidates[c];

    	        // Scale the final candidates score based on link density. Good content
    	        // should have a relatively small link density (5% or less) and be mostly
    	        // unaffected by this operation.
    	        var candidateScore = candidate.readability.contentScore * (1 - this._getLinkDensity(candidate));
    	        candidate.readability.contentScore = candidateScore;

    	        this.log("Candidate:", candidate, "with score " + candidateScore);

    	        for (var t = 0; t < this._nbTopCandidates; t++) {
    	          var aTopCandidate = topCandidates[t];

    	          if (!aTopCandidate || candidateScore > aTopCandidate.readability.contentScore) {
    	            topCandidates.splice(t, 0, candidate);
    	            if (topCandidates.length > this._nbTopCandidates)
    	              topCandidates.pop();
    	            break;
    	          }
    	        }
    	      }

    	      var topCandidate = topCandidates[0] || null;
    	      var neededToCreateTopCandidate = false;
    	      var parentOfTopCandidate;

    	      // If we still have no top candidate, just use the body as a last resort.
    	      // We also have to copy the body node so it is something we can modify.
    	      if (topCandidate === null || topCandidate.tagName === "BODY") {
    	        // Move all of the page's children into topCandidate
    	        topCandidate = doc.createElement("DIV");
    	        neededToCreateTopCandidate = true;
    	        // Move everything (not just elements, also text nodes etc.) into the container
    	        // so we even include text directly in the body:
    	        while (page.firstChild) {
    	          this.log("Moving child out:", page.firstChild);
    	          topCandidate.appendChild(page.firstChild);
    	        }

    	        page.appendChild(topCandidate);

    	        this._initializeNode(topCandidate);
    	      } else if (topCandidate) {
    	        // Find a better top candidate node if it contains (at least three) nodes which belong to `topCandidates` array
    	        // and whose scores are quite closed with current `topCandidate` node.
    	        var alternativeCandidateAncestors = [];
    	        for (var i = 1; i < topCandidates.length; i++) {
    	          if (topCandidates[i].readability.contentScore / topCandidate.readability.contentScore >= 0.75) {
    	            alternativeCandidateAncestors.push(this._getNodeAncestors(topCandidates[i]));
    	          }
    	        }
    	        var MINIMUM_TOPCANDIDATES = 3;
    	        if (alternativeCandidateAncestors.length >= MINIMUM_TOPCANDIDATES) {
    	          parentOfTopCandidate = topCandidate.parentNode;
    	          while (parentOfTopCandidate.tagName !== "BODY") {
    	            var listsContainingThisAncestor = 0;
    	            for (var ancestorIndex = 0; ancestorIndex < alternativeCandidateAncestors.length && listsContainingThisAncestor < MINIMUM_TOPCANDIDATES; ancestorIndex++) {
    	              listsContainingThisAncestor += Number(alternativeCandidateAncestors[ancestorIndex].includes(parentOfTopCandidate));
    	            }
    	            if (listsContainingThisAncestor >= MINIMUM_TOPCANDIDATES) {
    	              topCandidate = parentOfTopCandidate;
    	              break;
    	            }
    	            parentOfTopCandidate = parentOfTopCandidate.parentNode;
    	          }
    	        }
    	        if (!topCandidate.readability) {
    	          this._initializeNode(topCandidate);
    	        }

    	        // Because of our bonus system, parents of candidates might have scores
    	        // themselves. They get half of the node. There won't be nodes with higher
    	        // scores than our topCandidate, but if we see the score going *up* in the first
    	        // few steps up the tree, that's a decent sign that there might be more content
    	        // lurking in other places that we want to unify in. The sibling stuff
    	        // below does some of that - but only if we've looked high enough up the DOM
    	        // tree.
    	        parentOfTopCandidate = topCandidate.parentNode;
    	        var lastScore = topCandidate.readability.contentScore;
    	        // The scores shouldn't get too low.
    	        var scoreThreshold = lastScore / 3;
    	        while (parentOfTopCandidate.tagName !== "BODY") {
    	          if (!parentOfTopCandidate.readability) {
    	            parentOfTopCandidate = parentOfTopCandidate.parentNode;
    	            continue;
    	          }
    	          var parentScore = parentOfTopCandidate.readability.contentScore;
    	          if (parentScore < scoreThreshold)
    	            break;
    	          if (parentScore > lastScore) {
    	            // Alright! We found a better parent to use.
    	            topCandidate = parentOfTopCandidate;
    	            break;
    	          }
    	          lastScore = parentOfTopCandidate.readability.contentScore;
    	          parentOfTopCandidate = parentOfTopCandidate.parentNode;
    	        }

    	        // If the top candidate is the only child, use parent instead. This will help sibling
    	        // joining logic when adjacent content is actually located in parent's sibling node.
    	        parentOfTopCandidate = topCandidate.parentNode;
    	        while (parentOfTopCandidate.tagName != "BODY" && parentOfTopCandidate.children.length == 1) {
    	          topCandidate = parentOfTopCandidate;
    	          parentOfTopCandidate = topCandidate.parentNode;
    	        }
    	        if (!topCandidate.readability) {
    	          this._initializeNode(topCandidate);
    	        }
    	      }

    	      // Now that we have the top candidate, look through its siblings for content
    	      // that might also be related. Things like preambles, content split by ads
    	      // that we removed, etc.
    	      var articleContent = doc.createElement("DIV");
    	      if (isPaging)
    	        articleContent.id = "readability-content";

    	      var siblingScoreThreshold = Math.max(10, topCandidate.readability.contentScore * 0.2);
    	      // Keep potential top candidate's parent node to try to get text direction of it later.
    	      parentOfTopCandidate = topCandidate.parentNode;
    	      var siblings = parentOfTopCandidate.children;

    	      for (var s = 0, sl = siblings.length; s < sl; s++) {
    	        var sibling = siblings[s];
    	        var append = false;

    	        this.log("Looking at sibling node:", sibling, sibling.readability ? ("with score " + sibling.readability.contentScore) : "");
    	        this.log("Sibling has score", sibling.readability ? sibling.readability.contentScore : "Unknown");

    	        if (sibling === topCandidate) {
    	          append = true;
    	        } else {
    	          var contentBonus = 0;

    	          // Give a bonus if sibling nodes and top candidates have the example same classname
    	          if (sibling.className === topCandidate.className && topCandidate.className !== "")
    	            contentBonus += topCandidate.readability.contentScore * 0.2;

    	          if (sibling.readability &&
    	              ((sibling.readability.contentScore + contentBonus) >= siblingScoreThreshold)) {
    	            append = true;
    	          } else if (sibling.nodeName === "P") {
    	            var linkDensity = this._getLinkDensity(sibling);
    	            var nodeContent = this._getInnerText(sibling);
    	            var nodeLength = nodeContent.length;

    	            if (nodeLength > 80 && linkDensity < 0.25) {
    	              append = true;
    	            } else if (nodeLength < 80 && nodeLength > 0 && linkDensity === 0 &&
    	                       nodeContent.search(/\.( |$)/) !== -1) {
    	              append = true;
    	            }
    	          }
    	        }

    	        if (append) {
    	          this.log("Appending node:", sibling);

    	          if (this.ALTER_TO_DIV_EXCEPTIONS.indexOf(sibling.nodeName) === -1) {
    	            // We have a node that isn't a common block level element, like a form or td tag.
    	            // Turn it into a div so it doesn't get filtered out later by accident.
    	            this.log("Altering sibling:", sibling, "to div.");

    	            sibling = this._setNodeTag(sibling, "DIV");
    	          }

    	          articleContent.appendChild(sibling);
    	          // Fetch children again to make it compatible
    	          // with DOM parsers without live collection support.
    	          siblings = parentOfTopCandidate.children;
    	          // siblings is a reference to the children array, and
    	          // sibling is removed from the array when we call appendChild().
    	          // As a result, we must revisit this index since the nodes
    	          // have been shifted.
    	          s -= 1;
    	          sl -= 1;
    	        }
    	      }

    	      if (this._debug)
    	        this.log("Article content pre-prep: " + articleContent.innerHTML);
    	      // So we have all of the content that we need. Now we clean it up for presentation.
    	      this._prepArticle(articleContent);
    	      if (this._debug)
    	        this.log("Article content post-prep: " + articleContent.innerHTML);

    	      if (neededToCreateTopCandidate) {
    	        // We already created a fake div thing, and there wouldn't have been any siblings left
    	        // for the previous loop, so there's no point trying to create a new div, and then
    	        // move all the children over. Just assign IDs and class names here. No need to append
    	        // because that already happened anyway.
    	        topCandidate.id = "readability-page-1";
    	        topCandidate.className = "page";
    	      } else {
    	        var div = doc.createElement("DIV");
    	        div.id = "readability-page-1";
    	        div.className = "page";
    	        while (articleContent.firstChild) {
    	          div.appendChild(articleContent.firstChild);
    	        }
    	        articleContent.appendChild(div);
    	      }

    	      if (this._debug)
    	        this.log("Article content after paging: " + articleContent.innerHTML);

    	      var parseSuccessful = true;

    	      // Now that we've gone through the full algorithm, check to see if
    	      // we got any meaningful content. If we didn't, we may need to re-run
    	      // grabArticle with different flags set. This gives us a higher likelihood of
    	      // finding the content, and the sieve approach gives us a higher likelihood of
    	      // finding the -right- content.
    	      var textLength = this._getInnerText(articleContent, true).length;
    	      if (textLength < this._charThreshold) {
    	        parseSuccessful = false;
    	        page.innerHTML = pageCacheHtml;

    	        if (this._flagIsActive(this.FLAG_STRIP_UNLIKELYS)) {
    	          this._removeFlag(this.FLAG_STRIP_UNLIKELYS);
    	          this._attempts.push({articleContent: articleContent, textLength: textLength});
    	        } else if (this._flagIsActive(this.FLAG_WEIGHT_CLASSES)) {
    	          this._removeFlag(this.FLAG_WEIGHT_CLASSES);
    	          this._attempts.push({articleContent: articleContent, textLength: textLength});
    	        } else if (this._flagIsActive(this.FLAG_CLEAN_CONDITIONALLY)) {
    	          this._removeFlag(this.FLAG_CLEAN_CONDITIONALLY);
    	          this._attempts.push({articleContent: articleContent, textLength: textLength});
    	        } else {
    	          this._attempts.push({articleContent: articleContent, textLength: textLength});
    	          // No luck after removing flags, just return the longest text we found during the different loops
    	          this._attempts.sort(function (a, b) {
    	            return b.textLength - a.textLength;
    	          });

    	          // But first check if we actually have something
    	          if (!this._attempts[0].textLength) {
    	            return null;
    	          }

    	          articleContent = this._attempts[0].articleContent;
    	          parseSuccessful = true;
    	        }
    	      }

    	      if (parseSuccessful) {
    	        // Find out text direction from ancestors of final top candidate.
    	        var ancestors = [parentOfTopCandidate, topCandidate].concat(this._getNodeAncestors(parentOfTopCandidate));
    	        this._someNode(ancestors, function(ancestor) {
    	          if (!ancestor.tagName)
    	            return false;
    	          var articleDir = ancestor.getAttribute("dir");
    	          if (articleDir) {
    	            this._articleDir = articleDir;
    	            return true;
    	          }
    	          return false;
    	        });
    	        return articleContent;
    	      }
    	    }
    	  },

    	  /**
    	   * Check whether the input string could be a byline.
    	   * This verifies that the input is a string, and that the length
    	   * is less than 100 chars.
    	   *
    	   * @param possibleByline {string} - a string to check whether its a byline.
    	   * @return Boolean - whether the input string is a byline.
    	   */
    	  _isValidByline: function(byline) {
    	    if (typeof byline == "string" || byline instanceof String) {
    	      byline = byline.trim();
    	      return (byline.length > 0) && (byline.length < 100);
    	    }
    	    return false;
    	  },

    	  /**
    	   * Converts some of the common HTML entities in string to their corresponding characters.
    	   *
    	   * @param str {string} - a string to unescape.
    	   * @return string without HTML entity.
    	   */
    	  _unescapeHtmlEntities: function(str) {
    	    if (!str) {
    	      return str;
    	    }

    	    var htmlEscapeMap = this.HTML_ESCAPE_MAP;
    	    return str.replace(/&(quot|amp|apos|lt|gt);/g, function(_, tag) {
    	      return htmlEscapeMap[tag];
    	    }).replace(/&#(?:x([0-9a-z]{1,4})|([0-9]{1,4}));/gi, function(_, hex, numStr) {
    	      var num = parseInt(hex || numStr, hex ? 16 : 10);
    	      return String.fromCharCode(num);
    	    });
    	  },

    	  /**
    	   * Try to extract metadata from JSON-LD object.
    	   * For now, only Schema.org objects of type Article or its subtypes are supported.
    	   * @return Object with any metadata that could be extracted (possibly none)
    	   */
    	  _getJSONLD: function (doc) {
    	    var scripts = this._getAllNodesWithTag(doc, ["script"]);

    	    var metadata;

    	    this._forEachNode(scripts, function(jsonLdElement) {
    	      if (!metadata && jsonLdElement.getAttribute("type") === "application/ld+json") {
    	        try {
    	          // Strip CDATA markers if present
    	          var content = jsonLdElement.textContent.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "");
    	          var parsed = JSON.parse(content);
    	          if (
    	            !parsed["@context"] ||
    	            !parsed["@context"].match(/^https?\:\/\/schema\.org$/)
    	          ) {
    	            return;
    	          }

    	          if (!parsed["@type"] && Array.isArray(parsed["@graph"])) {
    	            parsed = parsed["@graph"].find(function(it) {
    	              return (it["@type"] || "").match(
    	                this.REGEXPS.jsonLdArticleTypes
    	              );
    	            });
    	          }

    	          if (
    	            !parsed ||
    	            !parsed["@type"] ||
    	            !parsed["@type"].match(this.REGEXPS.jsonLdArticleTypes)
    	          ) {
    	            return;
    	          }

    	          metadata = {};

    	          if (typeof parsed.name === "string" && typeof parsed.headline === "string" && parsed.name !== parsed.headline) {
    	            // we have both name and headline element in the JSON-LD. They should both be the same but some websites like aktualne.cz
    	            // put their own name into "name" and the article title to "headline" which confuses Readability. So we try to check if either
    	            // "name" or "headline" closely matches the html title, and if so, use that one. If not, then we use "name" by default.

    	            var title = this._getArticleTitle();
    	            var nameMatches = this._textSimilarity(parsed.name, title) > 0.75;
    	            var headlineMatches = this._textSimilarity(parsed.headline, title) > 0.75;

    	            if (headlineMatches && !nameMatches) {
    	              metadata.title = parsed.headline;
    	            } else {
    	              metadata.title = parsed.name;
    	            }
    	          } else if (typeof parsed.name === "string") {
    	            metadata.title = parsed.name.trim();
    	          } else if (typeof parsed.headline === "string") {
    	            metadata.title = parsed.headline.trim();
    	          }
    	          if (parsed.author) {
    	            if (typeof parsed.author.name === "string") {
    	              metadata.byline = parsed.author.name.trim();
    	            } else if (Array.isArray(parsed.author) && parsed.author[0] && typeof parsed.author[0].name === "string") {
    	              metadata.byline = parsed.author
    	                .filter(function(author) {
    	                  return author && typeof author.name === "string";
    	                })
    	                .map(function(author) {
    	                  return author.name.trim();
    	                })
    	                .join(", ");
    	            }
    	          }
    	          if (typeof parsed.description === "string") {
    	            metadata.excerpt = parsed.description.trim();
    	          }
    	          if (
    	            parsed.publisher &&
    	            typeof parsed.publisher.name === "string"
    	          ) {
    	            metadata.siteName = parsed.publisher.name.trim();
    	          }
    	          return;
    	        } catch (err) {
    	          this.log(err.message);
    	        }
    	      }
    	    });
    	    return metadata ? metadata : {};
    	  },

    	  /**
    	   * Attempts to get excerpt and byline metadata for the article.
    	   *
    	   * @param {Object} jsonld — object containing any metadata that
    	   * could be extracted from JSON-LD object.
    	   *
    	   * @return Object with optional "excerpt" and "byline" properties
    	   */
    	  _getArticleMetadata: function(jsonld) {
    	    var metadata = {};
    	    var values = {};
    	    var metaElements = this._doc.getElementsByTagName("meta");

    	    // property is a space-separated list of values
    	    var propertyPattern = /\s*(dc|dcterm|og|twitter)\s*:\s*(author|creator|description|title|site_name)\s*/gi;

    	    // name is a single value
    	    var namePattern = /^\s*(?:(dc|dcterm|og|twitter|weibo:(article|webpage))\s*[\.:]\s*)?(author|creator|description|title|site_name)\s*$/i;

    	    // Find description tags.
    	    this._forEachNode(metaElements, function(element) {
    	      var elementName = element.getAttribute("name");
    	      var elementProperty = element.getAttribute("property");
    	      var content = element.getAttribute("content");
    	      if (!content) {
    	        return;
    	      }
    	      var matches = null;
    	      var name = null;

    	      if (elementProperty) {
    	        matches = elementProperty.match(propertyPattern);
    	        if (matches) {
    	          // Convert to lowercase, and remove any whitespace
    	          // so we can match below.
    	          name = matches[0].toLowerCase().replace(/\s/g, "");
    	          // multiple authors
    	          values[name] = content.trim();
    	        }
    	      }
    	      if (!matches && elementName && namePattern.test(elementName)) {
    	        name = elementName;
    	        if (content) {
    	          // Convert to lowercase, remove any whitespace, and convert dots
    	          // to colons so we can match below.
    	          name = name.toLowerCase().replace(/\s/g, "").replace(/\./g, ":");
    	          values[name] = content.trim();
    	        }
    	      }
    	    });

    	    // get title
    	    metadata.title = jsonld.title ||
    	                     values["dc:title"] ||
    	                     values["dcterm:title"] ||
    	                     values["og:title"] ||
    	                     values["weibo:article:title"] ||
    	                     values["weibo:webpage:title"] ||
    	                     values["title"] ||
    	                     values["twitter:title"];

    	    if (!metadata.title) {
    	      metadata.title = this._getArticleTitle();
    	    }

    	    // get author
    	    metadata.byline = jsonld.byline ||
    	                      values["dc:creator"] ||
    	                      values["dcterm:creator"] ||
    	                      values["author"];

    	    // get description
    	    metadata.excerpt = jsonld.excerpt ||
    	                       values["dc:description"] ||
    	                       values["dcterm:description"] ||
    	                       values["og:description"] ||
    	                       values["weibo:article:description"] ||
    	                       values["weibo:webpage:description"] ||
    	                       values["description"] ||
    	                       values["twitter:description"];

    	    // get site name
    	    metadata.siteName = jsonld.siteName ||
    	                        values["og:site_name"];

    	    // in many sites the meta value is escaped with HTML entities,
    	    // so here we need to unescape it
    	    metadata.title = this._unescapeHtmlEntities(metadata.title);
    	    metadata.byline = this._unescapeHtmlEntities(metadata.byline);
    	    metadata.excerpt = this._unescapeHtmlEntities(metadata.excerpt);
    	    metadata.siteName = this._unescapeHtmlEntities(metadata.siteName);

    	    return metadata;
    	  },

    	  /**
    	   * Check if node is image, or if node contains exactly only one image
    	   * whether as a direct child or as its descendants.
    	   *
    	   * @param Element
    	  **/
    	  _isSingleImage: function(node) {
    	    if (node.tagName === "IMG") {
    	      return true;
    	    }

    	    if (node.children.length !== 1 || node.textContent.trim() !== "") {
    	      return false;
    	    }

    	    return this._isSingleImage(node.children[0]);
    	  },

    	  /**
    	   * Find all <noscript> that are located after <img> nodes, and which contain only one
    	   * <img> element. Replace the first image with the image from inside the <noscript> tag,
    	   * and remove the <noscript> tag. This improves the quality of the images we use on
    	   * some sites (e.g. Medium).
    	   *
    	   * @param Element
    	  **/
    	  _unwrapNoscriptImages: function(doc) {
    	    // Find img without source or attributes that might contains image, and remove it.
    	    // This is done to prevent a placeholder img is replaced by img from noscript in next step.
    	    var imgs = Array.from(doc.getElementsByTagName("img"));
    	    this._forEachNode(imgs, function(img) {
    	      for (var i = 0; i < img.attributes.length; i++) {
    	        var attr = img.attributes[i];
    	        switch (attr.name) {
    	          case "src":
    	          case "srcset":
    	          case "data-src":
    	          case "data-srcset":
    	            return;
    	        }

    	        if (/\.(jpg|jpeg|png|webp)/i.test(attr.value)) {
    	          return;
    	        }
    	      }

    	      img.parentNode.removeChild(img);
    	    });

    	    // Next find noscript and try to extract its image
    	    var noscripts = Array.from(doc.getElementsByTagName("noscript"));
    	    this._forEachNode(noscripts, function(noscript) {
    	      // Parse content of noscript and make sure it only contains image
    	      var tmp = doc.createElement("div");
    	      tmp.innerHTML = noscript.innerHTML;
    	      if (!this._isSingleImage(tmp)) {
    	        return;
    	      }

    	      // If noscript has previous sibling and it only contains image,
    	      // replace it with noscript content. However we also keep old
    	      // attributes that might contains image.
    	      var prevElement = noscript.previousElementSibling;
    	      if (prevElement && this._isSingleImage(prevElement)) {
    	        var prevImg = prevElement;
    	        if (prevImg.tagName !== "IMG") {
    	          prevImg = prevElement.getElementsByTagName("img")[0];
    	        }

    	        var newImg = tmp.getElementsByTagName("img")[0];
    	        for (var i = 0; i < prevImg.attributes.length; i++) {
    	          var attr = prevImg.attributes[i];
    	          if (attr.value === "") {
    	            continue;
    	          }

    	          if (attr.name === "src" || attr.name === "srcset" || /\.(jpg|jpeg|png|webp)/i.test(attr.value)) {
    	            if (newImg.getAttribute(attr.name) === attr.value) {
    	              continue;
    	            }

    	            var attrName = attr.name;
    	            if (newImg.hasAttribute(attrName)) {
    	              attrName = "data-old-" + attrName;
    	            }

    	            newImg.setAttribute(attrName, attr.value);
    	          }
    	        }

    	        noscript.parentNode.replaceChild(tmp.firstElementChild, prevElement);
    	      }
    	    });
    	  },

    	  /**
    	   * Removes script tags from the document.
    	   *
    	   * @param Element
    	  **/
    	  _removeScripts: function(doc) {
    	    this._removeNodes(this._getAllNodesWithTag(doc, ["script", "noscript"]));
    	  },

    	  /**
    	   * Check if this node has only whitespace and a single element with given tag
    	   * Returns false if the DIV node contains non-empty text nodes
    	   * or if it contains no element with given tag or more than 1 element.
    	   *
    	   * @param Element
    	   * @param string tag of child element
    	  **/
    	  _hasSingleTagInsideElement: function(element, tag) {
    	    // There should be exactly 1 element child with given tag
    	    if (element.children.length != 1 || element.children[0].tagName !== tag) {
    	      return false;
    	    }

    	    // And there should be no text nodes with real content
    	    return !this._someNode(element.childNodes, function(node) {
    	      return node.nodeType === this.TEXT_NODE &&
    	             this.REGEXPS.hasContent.test(node.textContent);
    	    });
    	  },

    	  _isElementWithoutContent: function(node) {
    	    return node.nodeType === this.ELEMENT_NODE &&
    	      node.textContent.trim().length == 0 &&
    	      (node.children.length == 0 ||
    	       node.children.length == node.getElementsByTagName("br").length + node.getElementsByTagName("hr").length);
    	  },

    	  /**
    	   * Determine whether element has any children block level elements.
    	   *
    	   * @param Element
    	   */
    	  _hasChildBlockElement: function (element) {
    	    return this._someNode(element.childNodes, function(node) {
    	      return this.DIV_TO_P_ELEMS.has(node.tagName) ||
    	             this._hasChildBlockElement(node);
    	    });
    	  },

    	  /***
    	   * Determine if a node qualifies as phrasing content.
    	   * https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/Content_categories#Phrasing_content
    	  **/
    	  _isPhrasingContent: function(node) {
    	    return node.nodeType === this.TEXT_NODE || this.PHRASING_ELEMS.indexOf(node.tagName) !== -1 ||
    	      ((node.tagName === "A" || node.tagName === "DEL" || node.tagName === "INS") &&
    	        this._everyNode(node.childNodes, this._isPhrasingContent));
    	  },

    	  _isWhitespace: function(node) {
    	    return (node.nodeType === this.TEXT_NODE && node.textContent.trim().length === 0) ||
    	           (node.nodeType === this.ELEMENT_NODE && node.tagName === "BR");
    	  },

    	  /**
    	   * Get the inner text of a node - cross browser compatibly.
    	   * This also strips out any excess whitespace to be found.
    	   *
    	   * @param Element
    	   * @param Boolean normalizeSpaces (default: true)
    	   * @return string
    	  **/
    	  _getInnerText: function(e, normalizeSpaces) {
    	    normalizeSpaces = (typeof normalizeSpaces === "undefined") ? true : normalizeSpaces;
    	    var textContent = e.textContent.trim();

    	    if (normalizeSpaces) {
    	      return textContent.replace(this.REGEXPS.normalize, " ");
    	    }
    	    return textContent;
    	  },

    	  /**
    	   * Get the number of times a string s appears in the node e.
    	   *
    	   * @param Element
    	   * @param string - what to split on. Default is ","
    	   * @return number (integer)
    	  **/
    	  _getCharCount: function(e, s) {
    	    s = s || ",";
    	    return this._getInnerText(e).split(s).length - 1;
    	  },

    	  /**
    	   * Remove the style attribute on every e and under.
    	   * TODO: Test if getElementsByTagName(*) is faster.
    	   *
    	   * @param Element
    	   * @return void
    	  **/
    	  _cleanStyles: function(e) {
    	    if (!e || e.tagName.toLowerCase() === "svg")
    	      return;

    	    // Remove `style` and deprecated presentational attributes
    	    for (var i = 0; i < this.PRESENTATIONAL_ATTRIBUTES.length; i++) {
    	      e.removeAttribute(this.PRESENTATIONAL_ATTRIBUTES[i]);
    	    }

    	    if (this.DEPRECATED_SIZE_ATTRIBUTE_ELEMS.indexOf(e.tagName) !== -1) {
    	      e.removeAttribute("width");
    	      e.removeAttribute("height");
    	    }

    	    var cur = e.firstElementChild;
    	    while (cur !== null) {
    	      this._cleanStyles(cur);
    	      cur = cur.nextElementSibling;
    	    }
    	  },

    	  /**
    	   * Get the density of links as a percentage of the content
    	   * This is the amount of text that is inside a link divided by the total text in the node.
    	   *
    	   * @param Element
    	   * @return number (float)
    	  **/
    	  _getLinkDensity: function(element) {
    	    var textLength = this._getInnerText(element).length;
    	    if (textLength === 0)
    	      return 0;

    	    var linkLength = 0;

    	    // XXX implement _reduceNodeList?
    	    this._forEachNode(element.getElementsByTagName("a"), function(linkNode) {
    	      var href = linkNode.getAttribute("href");
    	      var coefficient = href && this.REGEXPS.hashUrl.test(href) ? 0.3 : 1;
    	      linkLength += this._getInnerText(linkNode).length * coefficient;
    	    });

    	    return linkLength / textLength;
    	  },

    	  /**
    	   * Get an elements class/id weight. Uses regular expressions to tell if this
    	   * element looks good or bad.
    	   *
    	   * @param Element
    	   * @return number (Integer)
    	  **/
    	  _getClassWeight: function(e) {
    	    if (!this._flagIsActive(this.FLAG_WEIGHT_CLASSES))
    	      return 0;

    	    var weight = 0;

    	    // Look for a special classname
    	    if (typeof(e.className) === "string" && e.className !== "") {
    	      if (this.REGEXPS.negative.test(e.className))
    	        weight -= 25;

    	      if (this.REGEXPS.positive.test(e.className))
    	        weight += 25;
    	    }

    	    // Look for a special ID
    	    if (typeof(e.id) === "string" && e.id !== "") {
    	      if (this.REGEXPS.negative.test(e.id))
    	        weight -= 25;

    	      if (this.REGEXPS.positive.test(e.id))
    	        weight += 25;
    	    }

    	    return weight;
    	  },

    	  /**
    	   * Clean a node of all elements of type "tag".
    	   * (Unless it's a youtube/vimeo video. People love movies.)
    	   *
    	   * @param Element
    	   * @param string tag to clean
    	   * @return void
    	   **/
    	  _clean: function(e, tag) {
    	    var isEmbed = ["object", "embed", "iframe"].indexOf(tag) !== -1;

    	    this._removeNodes(this._getAllNodesWithTag(e, [tag]), function(element) {
    	      // Allow youtube and vimeo videos through as people usually want to see those.
    	      if (isEmbed) {
    	        // First, check the elements attributes to see if any of them contain youtube or vimeo
    	        for (var i = 0; i < element.attributes.length; i++) {
    	          if (this._allowedVideoRegex.test(element.attributes[i].value)) {
    	            return false;
    	          }
    	        }

    	        // For embed with <object> tag, check inner HTML as well.
    	        if (element.tagName === "object" && this._allowedVideoRegex.test(element.innerHTML)) {
    	          return false;
    	        }
    	      }

    	      return true;
    	    });
    	  },

    	  /**
    	   * Check if a given node has one of its ancestor tag name matching the
    	   * provided one.
    	   * @param  HTMLElement node
    	   * @param  String      tagName
    	   * @param  Number      maxDepth
    	   * @param  Function    filterFn a filter to invoke to determine whether this node 'counts'
    	   * @return Boolean
    	   */
    	  _hasAncestorTag: function(node, tagName, maxDepth, filterFn) {
    	    maxDepth = maxDepth || 3;
    	    tagName = tagName.toUpperCase();
    	    var depth = 0;
    	    while (node.parentNode) {
    	      if (maxDepth > 0 && depth > maxDepth)
    	        return false;
    	      if (node.parentNode.tagName === tagName && (!filterFn || filterFn(node.parentNode)))
    	        return true;
    	      node = node.parentNode;
    	      depth++;
    	    }
    	    return false;
    	  },

    	  /**
    	   * Return an object indicating how many rows and columns this table has.
    	   */
    	  _getRowAndColumnCount: function(table) {
    	    var rows = 0;
    	    var columns = 0;
    	    var trs = table.getElementsByTagName("tr");
    	    for (var i = 0; i < trs.length; i++) {
    	      var rowspan = trs[i].getAttribute("rowspan") || 0;
    	      if (rowspan) {
    	        rowspan = parseInt(rowspan, 10);
    	      }
    	      rows += (rowspan || 1);

    	      // Now look for column-related info
    	      var columnsInThisRow = 0;
    	      var cells = trs[i].getElementsByTagName("td");
    	      for (var j = 0; j < cells.length; j++) {
    	        var colspan = cells[j].getAttribute("colspan") || 0;
    	        if (colspan) {
    	          colspan = parseInt(colspan, 10);
    	        }
    	        columnsInThisRow += (colspan || 1);
    	      }
    	      columns = Math.max(columns, columnsInThisRow);
    	    }
    	    return {rows: rows, columns: columns};
    	  },

    	  /**
    	   * Look for 'data' (as opposed to 'layout') tables, for which we use
    	   * similar checks as
    	   * https://searchfox.org/mozilla-central/rev/f82d5c549f046cb64ce5602bfd894b7ae807c8f8/accessible/generic/TableAccessible.cpp#19
    	   */
    	  _markDataTables: function(root) {
    	    var tables = root.getElementsByTagName("table");
    	    for (var i = 0; i < tables.length; i++) {
    	      var table = tables[i];
    	      var role = table.getAttribute("role");
    	      if (role == "presentation") {
    	        table._readabilityDataTable = false;
    	        continue;
    	      }
    	      var datatable = table.getAttribute("datatable");
    	      if (datatable == "0") {
    	        table._readabilityDataTable = false;
    	        continue;
    	      }
    	      var summary = table.getAttribute("summary");
    	      if (summary) {
    	        table._readabilityDataTable = true;
    	        continue;
    	      }

    	      var caption = table.getElementsByTagName("caption")[0];
    	      if (caption && caption.childNodes.length > 0) {
    	        table._readabilityDataTable = true;
    	        continue;
    	      }

    	      // If the table has a descendant with any of these tags, consider a data table:
    	      var dataTableDescendants = ["col", "colgroup", "tfoot", "thead", "th"];
    	      var descendantExists = function(tag) {
    	        return !!table.getElementsByTagName(tag)[0];
    	      };
    	      if (dataTableDescendants.some(descendantExists)) {
    	        this.log("Data table because found data-y descendant");
    	        table._readabilityDataTable = true;
    	        continue;
    	      }

    	      // Nested tables indicate a layout table:
    	      if (table.getElementsByTagName("table")[0]) {
    	        table._readabilityDataTable = false;
    	        continue;
    	      }

    	      var sizeInfo = this._getRowAndColumnCount(table);
    	      if (sizeInfo.rows >= 10 || sizeInfo.columns > 4) {
    	        table._readabilityDataTable = true;
    	        continue;
    	      }
    	      // Now just go by size entirely:
    	      table._readabilityDataTable = sizeInfo.rows * sizeInfo.columns > 10;
    	    }
    	  },

    	  /* convert images and figures that have properties like data-src into images that can be loaded without JS */
    	  _fixLazyImages: function (root) {
    	    this._forEachNode(this._getAllNodesWithTag(root, ["img", "picture", "figure"]), function (elem) {
    	      // In some sites (e.g. Kotaku), they put 1px square image as base64 data uri in the src attribute.
    	      // So, here we check if the data uri is too short, just might as well remove it.
    	      if (elem.src && this.REGEXPS.b64DataUrl.test(elem.src)) {
    	        // Make sure it's not SVG, because SVG can have a meaningful image in under 133 bytes.
    	        var parts = this.REGEXPS.b64DataUrl.exec(elem.src);
    	        if (parts[1] === "image/svg+xml") {
    	          return;
    	        }

    	        // Make sure this element has other attributes which contains image.
    	        // If it doesn't, then this src is important and shouldn't be removed.
    	        var srcCouldBeRemoved = false;
    	        for (var i = 0; i < elem.attributes.length; i++) {
    	          var attr = elem.attributes[i];
    	          if (attr.name === "src") {
    	            continue;
    	          }

    	          if (/\.(jpg|jpeg|png|webp)/i.test(attr.value)) {
    	            srcCouldBeRemoved = true;
    	            break;
    	          }
    	        }

    	        // Here we assume if image is less than 100 bytes (or 133B after encoded to base64)
    	        // it will be too small, therefore it might be placeholder image.
    	        if (srcCouldBeRemoved) {
    	          var b64starts = elem.src.search(/base64\s*/i) + 7;
    	          var b64length = elem.src.length - b64starts;
    	          if (b64length < 133) {
    	            elem.removeAttribute("src");
    	          }
    	        }
    	      }

    	      // also check for "null" to work around https://github.com/jsdom/jsdom/issues/2580
    	      if ((elem.src || (elem.srcset && elem.srcset != "null")) && elem.className.toLowerCase().indexOf("lazy") === -1) {
    	        return;
    	      }

    	      for (var j = 0; j < elem.attributes.length; j++) {
    	        attr = elem.attributes[j];
    	        if (attr.name === "src" || attr.name === "srcset" || attr.name === "alt") {
    	          continue;
    	        }
    	        var copyTo = null;
    	        if (/\.(jpg|jpeg|png|webp)\s+\d/.test(attr.value)) {
    	          copyTo = "srcset";
    	        } else if (/^\s*\S+\.(jpg|jpeg|png|webp)\S*\s*$/.test(attr.value)) {
    	          copyTo = "src";
    	        }
    	        if (copyTo) {
    	          //if this is an img or picture, set the attribute directly
    	          if (elem.tagName === "IMG" || elem.tagName === "PICTURE") {
    	            elem.setAttribute(copyTo, attr.value);
    	          } else if (elem.tagName === "FIGURE" && !this._getAllNodesWithTag(elem, ["img", "picture"]).length) {
    	            //if the item is a <figure> that does not contain an image or picture, create one and place it inside the figure
    	            //see the nytimes-3 testcase for an example
    	            var img = this._doc.createElement("img");
    	            img.setAttribute(copyTo, attr.value);
    	            elem.appendChild(img);
    	          }
    	        }
    	      }
    	    });
    	  },

    	  _getTextDensity: function(e, tags) {
    	    var textLength = this._getInnerText(e, true).length;
    	    if (textLength === 0) {
    	      return 0;
    	    }
    	    var childrenLength = 0;
    	    var children = this._getAllNodesWithTag(e, tags);
    	    this._forEachNode(children, (child) => childrenLength += this._getInnerText(child, true).length);
    	    return childrenLength / textLength;
    	  },

    	  /**
    	   * Clean an element of all tags of type "tag" if they look fishy.
    	   * "Fishy" is an algorithm based on content length, classnames, link density, number of images & embeds, etc.
    	   *
    	   * @return void
    	   **/
    	  _cleanConditionally: function(e, tag) {
    	    if (!this._flagIsActive(this.FLAG_CLEAN_CONDITIONALLY))
    	      return;

    	    // Gather counts for other typical elements embedded within.
    	    // Traverse backwards so we can remove nodes at the same time
    	    // without effecting the traversal.
    	    //
    	    // TODO: Consider taking into account original contentScore here.
    	    this._removeNodes(this._getAllNodesWithTag(e, [tag]), function(node) {
    	      // First check if this node IS data table, in which case don't remove it.
    	      var isDataTable = function(t) {
    	        return t._readabilityDataTable;
    	      };

    	      var isList = tag === "ul" || tag === "ol";
    	      if (!isList) {
    	        var listLength = 0;
    	        var listNodes = this._getAllNodesWithTag(node, ["ul", "ol"]);
    	        this._forEachNode(listNodes, (list) => listLength += this._getInnerText(list).length);
    	        isList = listLength / this._getInnerText(node).length > 0.9;
    	      }

    	      if (tag === "table" && isDataTable(node)) {
    	        return false;
    	      }

    	      // Next check if we're inside a data table, in which case don't remove it as well.
    	      if (this._hasAncestorTag(node, "table", -1, isDataTable)) {
    	        return false;
    	      }

    	      if (this._hasAncestorTag(node, "code")) {
    	        return false;
    	      }

    	      var weight = this._getClassWeight(node);

    	      this.log("Cleaning Conditionally", node);

    	      var contentScore = 0;

    	      if (weight + contentScore < 0) {
    	        return true;
    	      }

    	      if (this._getCharCount(node, ",") < 10) {
    	        // If there are not very many commas, and the number of
    	        // non-paragraph elements is more than paragraphs or other
    	        // ominous signs, remove the element.
    	        var p = node.getElementsByTagName("p").length;
    	        var img = node.getElementsByTagName("img").length;
    	        var li = node.getElementsByTagName("li").length - 100;
    	        var input = node.getElementsByTagName("input").length;
    	        var headingDensity = this._getTextDensity(node, ["h1", "h2", "h3", "h4", "h5", "h6"]);

    	        var embedCount = 0;
    	        var embeds = this._getAllNodesWithTag(node, ["object", "embed", "iframe"]);

    	        for (var i = 0; i < embeds.length; i++) {
    	          // If this embed has attribute that matches video regex, don't delete it.
    	          for (var j = 0; j < embeds[i].attributes.length; j++) {
    	            if (this._allowedVideoRegex.test(embeds[i].attributes[j].value)) {
    	              return false;
    	            }
    	          }

    	          // For embed with <object> tag, check inner HTML as well.
    	          if (embeds[i].tagName === "object" && this._allowedVideoRegex.test(embeds[i].innerHTML)) {
    	            return false;
    	          }

    	          embedCount++;
    	        }

    	        var linkDensity = this._getLinkDensity(node);
    	        var contentLength = this._getInnerText(node).length;

    	        var haveToRemove =
    	          (img > 1 && p / img < 0.5 && !this._hasAncestorTag(node, "figure")) ||
    	          (!isList && li > p) ||
    	          (input > Math.floor(p/3)) ||
    	          (!isList && headingDensity < 0.9 && contentLength < 25 && (img === 0 || img > 2) && !this._hasAncestorTag(node, "figure")) ||
    	          (!isList && weight < 25 && linkDensity > 0.2) ||
    	          (weight >= 25 && linkDensity > 0.5) ||
    	          ((embedCount === 1 && contentLength < 75) || embedCount > 1);
    	        // Allow simple lists of images to remain in pages
    	        if (isList && haveToRemove) {
    	          for (var x = 0; x < node.children.length; x++) {
    	            let child = node.children[x];
    	            // Don't filter in lists with li's that contain more than one child
    	            if (child.children.length > 1) {
    	              return haveToRemove;
    	            }
    	          }
    	          let li_count = node.getElementsByTagName("li").length;
    	          // Only allow the list to remain if every li contains an image
    	          if (img == li_count) {
    	            return false;
    	          }
    	        }
    	        return haveToRemove;
    	      }
    	      return false;
    	    });
    	  },

    	  /**
    	   * Clean out elements that match the specified conditions
    	   *
    	   * @param Element
    	   * @param Function determines whether a node should be removed
    	   * @return void
    	   **/
    	  _cleanMatchedNodes: function(e, filter) {
    	    var endOfSearchMarkerNode = this._getNextNode(e, true);
    	    var next = this._getNextNode(e);
    	    while (next && next != endOfSearchMarkerNode) {
    	      if (filter.call(this, next, next.className + " " + next.id)) {
    	        next = this._removeAndGetNext(next);
    	      } else {
    	        next = this._getNextNode(next);
    	      }
    	    }
    	  },

    	  /**
    	   * Clean out spurious headers from an Element.
    	   *
    	   * @param Element
    	   * @return void
    	  **/
    	  _cleanHeaders: function(e) {
    	    let headingNodes = this._getAllNodesWithTag(e, ["h1", "h2"]);
    	    this._removeNodes(headingNodes, function(node) {
    	      let shouldRemove = this._getClassWeight(node) < 0;
    	      if (shouldRemove) {
    	        this.log("Removing header with low class weight:", node);
    	      }
    	      return shouldRemove;
    	    });
    	  },

    	  /**
    	   * Check if this node is an H1 or H2 element whose content is mostly
    	   * the same as the article title.
    	   *
    	   * @param Element  the node to check.
    	   * @return boolean indicating whether this is a title-like header.
    	   */
    	  _headerDuplicatesTitle: function(node) {
    	    if (node.tagName != "H1" && node.tagName != "H2") {
    	      return false;
    	    }
    	    var heading = this._getInnerText(node, false);
    	    this.log("Evaluating similarity of header:", heading, this._articleTitle);
    	    return this._textSimilarity(this._articleTitle, heading) > 0.75;
    	  },

    	  _flagIsActive: function(flag) {
    	    return (this._flags & flag) > 0;
    	  },

    	  _removeFlag: function(flag) {
    	    this._flags = this._flags & ~flag;
    	  },

    	  _isProbablyVisible: function(node) {
    	    // Have to null-check node.style and node.className.indexOf to deal with SVG and MathML nodes.
    	    return (!node.style || node.style.display != "none")
    	      && !node.hasAttribute("hidden")
    	      //check for "fallback-image" so that wikimedia math images are displayed
    	      && (!node.hasAttribute("aria-hidden") || node.getAttribute("aria-hidden") != "true" || (node.className && node.className.indexOf && node.className.indexOf("fallback-image") !== -1));
    	  },

    	  /**
    	   * Runs readability.
    	   *
    	   * Workflow:
    	   *  1. Prep the document by removing script tags, css, etc.
    	   *  2. Build readability's DOM tree.
    	   *  3. Grab the article content from the current dom tree.
    	   *  4. Replace the current DOM tree with the new one.
    	   *  5. Read peacefully.
    	   *
    	   * @return void
    	   **/
    	  parse: function () {
    	    // Avoid parsing too large documents, as per configuration option
    	    if (this._maxElemsToParse > 0) {
    	      var numTags = this._doc.getElementsByTagName("*").length;
    	      if (numTags > this._maxElemsToParse) {
    	        throw new Error("Aborting parsing document; " + numTags + " elements found");
    	      }
    	    }

    	    // Unwrap image from noscript
    	    this._unwrapNoscriptImages(this._doc);

    	    // Extract JSON-LD metadata before removing scripts
    	    var jsonLd = this._disableJSONLD ? {} : this._getJSONLD(this._doc);

    	    // Remove script tags from the document.
    	    this._removeScripts(this._doc);

    	    this._prepDocument();

    	    var metadata = this._getArticleMetadata(jsonLd);
    	    this._articleTitle = metadata.title;

    	    var articleContent = this._grabArticle();
    	    if (!articleContent)
    	      return null;

    	    this.log("Grabbed: " + articleContent.innerHTML);

    	    this._postProcessContent(articleContent);

    	    // If we haven't found an excerpt in the article's metadata, use the article's
    	    // first paragraph as the excerpt. This is used for displaying a preview of
    	    // the article's content.
    	    if (!metadata.excerpt) {
    	      var paragraphs = articleContent.getElementsByTagName("p");
    	      if (paragraphs.length > 0) {
    	        metadata.excerpt = paragraphs[0].textContent.trim();
    	      }
    	    }

    	    var textContent = articleContent.textContent;
    	    return {
    	      title: this._articleTitle,
    	      byline: metadata.byline || this._articleByline,
    	      dir: this._articleDir,
    	      lang: this._articleLang,
    	      content: this._serializer(articleContent),
    	      textContent: textContent,
    	      length: textContent.length,
    	      excerpt: metadata.excerpt,
    	      siteName: metadata.siteName || this._articleSiteName
    	    };
    	  }
    	};

    	{
    	  /* global module */
    	  module.exports = Readability;
    	}
    } (Readability$1));

    var ReadabilityReaderableExports = {};
    var ReadabilityReaderable = {
      get exports(){ return ReadabilityReaderableExports; },
      set exports(v){ ReadabilityReaderableExports = v; },
    };

    /*
     * Copyright (c) 2010 Arc90 Inc
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *     http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */

    (function (module) {
    	/*
    	 * This code is heavily based on Arc90's readability.js (1.7.1) script
    	 * available at: http://code.google.com/p/arc90labs-readability
    	 */

    	var REGEXPS = {
    	  // NOTE: These two regular expressions are duplicated in
    	  // Readability.js. Please keep both copies in sync.
    	  unlikelyCandidates: /-ad-|ai2html|banner|breadcrumbs|combx|comment|community|cover-wrap|disqus|extra|footer|gdpr|header|legends|menu|related|remark|replies|rss|shoutbox|sidebar|skyscraper|social|sponsor|supplemental|ad-break|agegate|pagination|pager|popup|yom-remote/i,
    	  okMaybeItsACandidate: /and|article|body|column|content|main|shadow/i,
    	};

    	function isNodeVisible(node) {
    	  // Have to null-check node.style and node.className.indexOf to deal with SVG and MathML nodes.
    	  return (!node.style || node.style.display != "none")
    	    && !node.hasAttribute("hidden")
    	    //check for "fallback-image" so that wikimedia math images are displayed
    	    && (!node.hasAttribute("aria-hidden") || node.getAttribute("aria-hidden") != "true" || (node.className && node.className.indexOf && node.className.indexOf("fallback-image") !== -1));
    	}

    	/**
    	 * Decides whether or not the document is reader-able without parsing the whole thing.
    	 * @param {Object} options Configuration object.
    	 * @param {number} [options.minContentLength=140] The minimum node content length used to decide if the document is readerable.
    	 * @param {number} [options.minScore=20] The minumum cumulated 'score' used to determine if the document is readerable.
    	 * @param {Function} [options.visibilityChecker=isNodeVisible] The function used to determine if a node is visible.
    	 * @return {boolean} Whether or not we suspect Readability.parse() will suceeed at returning an article object.
    	 */
    	function isProbablyReaderable(doc, options = {}) {
    	  // For backward compatibility reasons 'options' can either be a configuration object or the function used
    	  // to determine if a node is visible.
    	  if (typeof options == "function") {
    	    options = { visibilityChecker: options };
    	  }

    	  var defaultOptions = { minScore: 20, minContentLength: 140, visibilityChecker: isNodeVisible };
    	  options = Object.assign(defaultOptions, options);

    	  var nodes = doc.querySelectorAll("p, pre, article");

    	  // Get <div> nodes which have <br> node(s) and append them into the `nodes` variable.
    	  // Some articles' DOM structures might look like
    	  // <div>
    	  //   Sentences<br>
    	  //   <br>
    	  //   Sentences<br>
    	  // </div>
    	  var brNodes = doc.querySelectorAll("div > br");
    	  if (brNodes.length) {
    	    var set = new Set(nodes);
    	    [].forEach.call(brNodes, function (node) {
    	      set.add(node.parentNode);
    	    });
    	    nodes = Array.from(set);
    	  }

    	  var score = 0;
    	  // This is a little cheeky, we use the accumulator 'score' to decide what to return from
    	  // this callback:
    	  return [].some.call(nodes, function (node) {
    	    if (!options.visibilityChecker(node)) {
    	      return false;
    	    }

    	    var matchString = node.className + " " + node.id;
    	    if (REGEXPS.unlikelyCandidates.test(matchString) &&
    	        !REGEXPS.okMaybeItsACandidate.test(matchString)) {
    	      return false;
    	    }

    	    if (node.matches("li p")) {
    	      return false;
    	    }

    	    var textContentLength = node.textContent.trim().length;
    	    if (textContentLength < options.minContentLength) {
    	      return false;
    	    }

    	    score += Math.sqrt(textContentLength - options.minContentLength);

    	    if (score > options.minScore) {
    	      return true;
    	    }
    	    return false;
    	  });
    	}

    	{
    	  /* global module */
    	  module.exports = isProbablyReaderable;
    	}
    } (ReadabilityReaderable));

    /* eslint-env node */

    var Readability = ReadabilityExports;
    var isProbablyReaderable = ReadabilityReaderableExports;

    var readability = {
      Readability: Readability,
      isProbablyReaderable: isProbablyReaderable
    };

    function extend$1 (destination) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];
        for (var key in source) {
          if (source.hasOwnProperty(key)) destination[key] = source[key];
        }
      }
      return destination
    }

    function repeat (character, count) {
      return Array(count + 1).join(character)
    }

    function trimLeadingNewlines (string) {
      return string.replace(/^\n*/, '')
    }

    function trimTrailingNewlines (string) {
      // avoid match-at-end regexp bottleneck, see #370
      var indexEnd = string.length;
      while (indexEnd > 0 && string[indexEnd - 1] === '\n') indexEnd--;
      return string.substring(0, indexEnd)
    }

    var blockElements = [
      'ADDRESS', 'ARTICLE', 'ASIDE', 'AUDIO', 'BLOCKQUOTE', 'BODY', 'CANVAS',
      'CENTER', 'DD', 'DIR', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE',
      'FOOTER', 'FORM', 'FRAMESET', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER',
      'HGROUP', 'HR', 'HTML', 'ISINDEX', 'LI', 'MAIN', 'MENU', 'NAV', 'NOFRAMES',
      'NOSCRIPT', 'OL', 'OUTPUT', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD',
      'TFOOT', 'TH', 'THEAD', 'TR', 'UL'
    ];

    function isBlock (node) {
      return is(node, blockElements)
    }

    var voidElements = [
      'AREA', 'BASE', 'BR', 'COL', 'COMMAND', 'EMBED', 'HR', 'IMG', 'INPUT',
      'KEYGEN', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR'
    ];

    function isVoid (node) {
      return is(node, voidElements)
    }

    function hasVoid (node) {
      return has(node, voidElements)
    }

    var meaningfulWhenBlankElements = [
      'A', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TH', 'TD', 'IFRAME', 'SCRIPT',
      'AUDIO', 'VIDEO'
    ];

    function isMeaningfulWhenBlank (node) {
      return is(node, meaningfulWhenBlankElements)
    }

    function hasMeaningfulWhenBlank (node) {
      return has(node, meaningfulWhenBlankElements)
    }

    function is (node, tagNames) {
      return tagNames.indexOf(node.nodeName) >= 0
    }

    function has (node, tagNames) {
      return (
        node.getElementsByTagName &&
        tagNames.some(function (tagName) {
          return node.getElementsByTagName(tagName).length
        })
      )
    }

    var rules = {};

    rules.paragraph = {
      filter: 'p',

      replacement: function (content) {
        return '\n\n' + content + '\n\n'
      }
    };

    rules.lineBreak = {
      filter: 'br',

      replacement: function (content, node, options) {
        return options.br + '\n'
      }
    };

    rules.heading = {
      filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],

      replacement: function (content, node, options) {
        var hLevel = Number(node.nodeName.charAt(1));

        if (options.headingStyle === 'setext' && hLevel < 3) {
          var underline = repeat((hLevel === 1 ? '=' : '-'), content.length);
          return (
            '\n\n' + content + '\n' + underline + '\n\n'
          )
        } else {
          return '\n\n' + repeat('#', hLevel) + ' ' + content + '\n\n'
        }
      }
    };

    rules.blockquote = {
      filter: 'blockquote',

      replacement: function (content) {
        content = content.replace(/^\n+|\n+$/g, '');
        content = content.replace(/^/gm, '> ');
        return '\n\n' + content + '\n\n'
      }
    };

    rules.list = {
      filter: ['ul', 'ol'],

      replacement: function (content, node) {
        var parent = node.parentNode;
        if (parent.nodeName === 'LI' && parent.lastElementChild === node) {
          return '\n' + content
        } else {
          return '\n\n' + content + '\n\n'
        }
      }
    };

    rules.listItem = {
      filter: 'li',

      replacement: function (content, node, options) {
        content = content
          .replace(/^\n+/, '') // remove leading newlines
          .replace(/\n+$/, '\n') // replace trailing newlines with just a single one
          .replace(/\n/gm, '\n    '); // indent
        var prefix = options.bulletListMarker + '   ';
        var parent = node.parentNode;
        if (parent.nodeName === 'OL') {
          var start = parent.getAttribute('start');
          var index = Array.prototype.indexOf.call(parent.children, node);
          prefix = (start ? Number(start) + index : index + 1) + '.  ';
        }
        return (
          prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '')
        )
      }
    };

    rules.indentedCodeBlock = {
      filter: function (node, options) {
        return (
          options.codeBlockStyle === 'indented' &&
          node.nodeName === 'PRE' &&
          node.firstChild &&
          node.firstChild.nodeName === 'CODE'
        )
      },

      replacement: function (content, node, options) {
        return (
          '\n\n    ' +
          node.firstChild.textContent.replace(/\n/g, '\n    ') +
          '\n\n'
        )
      }
    };

    rules.fencedCodeBlock = {
      filter: function (node, options) {
        return (
          options.codeBlockStyle === 'fenced' &&
          node.nodeName === 'PRE' &&
          node.firstChild &&
          node.firstChild.nodeName === 'CODE'
        )
      },

      replacement: function (content, node, options) {
        var className = node.firstChild.getAttribute('class') || '';
        var language = (className.match(/language-(\S+)/) || [null, ''])[1];
        var code = node.firstChild.textContent;

        var fenceChar = options.fence.charAt(0);
        var fenceSize = 3;
        var fenceInCodeRegex = new RegExp('^' + fenceChar + '{3,}', 'gm');

        var match;
        while ((match = fenceInCodeRegex.exec(code))) {
          if (match[0].length >= fenceSize) {
            fenceSize = match[0].length + 1;
          }
        }

        var fence = repeat(fenceChar, fenceSize);

        return (
          '\n\n' + fence + language + '\n' +
          code.replace(/\n$/, '') +
          '\n' + fence + '\n\n'
        )
      }
    };

    rules.horizontalRule = {
      filter: 'hr',

      replacement: function (content, node, options) {
        return '\n\n' + options.hr + '\n\n'
      }
    };

    rules.inlineLink = {
      filter: function (node, options) {
        return (
          options.linkStyle === 'inlined' &&
          node.nodeName === 'A' &&
          node.getAttribute('href')
        )
      },

      replacement: function (content, node) {
        var href = node.getAttribute('href');
        var title = cleanAttribute(node.getAttribute('title'));
        if (title) title = ' "' + title + '"';
        return '[' + content + '](' + href + title + ')'
      }
    };

    rules.referenceLink = {
      filter: function (node, options) {
        return (
          options.linkStyle === 'referenced' &&
          node.nodeName === 'A' &&
          node.getAttribute('href')
        )
      },

      replacement: function (content, node, options) {
        var href = node.getAttribute('href');
        var title = cleanAttribute(node.getAttribute('title'));
        if (title) title = ' "' + title + '"';
        var replacement;
        var reference;

        switch (options.linkReferenceStyle) {
          case 'collapsed':
            replacement = '[' + content + '][]';
            reference = '[' + content + ']: ' + href + title;
            break
          case 'shortcut':
            replacement = '[' + content + ']';
            reference = '[' + content + ']: ' + href + title;
            break
          default:
            var id = this.references.length + 1;
            replacement = '[' + content + '][' + id + ']';
            reference = '[' + id + ']: ' + href + title;
        }

        this.references.push(reference);
        return replacement
      },

      references: [],

      append: function (options) {
        var references = '';
        if (this.references.length) {
          references = '\n\n' + this.references.join('\n') + '\n\n';
          this.references = []; // Reset references
        }
        return references
      }
    };

    rules.emphasis = {
      filter: ['em', 'i'],

      replacement: function (content, node, options) {
        if (!content.trim()) return ''
        return options.emDelimiter + content + options.emDelimiter
      }
    };

    rules.strong = {
      filter: ['strong', 'b'],

      replacement: function (content, node, options) {
        if (!content.trim()) return ''
        return options.strongDelimiter + content + options.strongDelimiter
      }
    };

    rules.code = {
      filter: function (node) {
        var hasSiblings = node.previousSibling || node.nextSibling;
        var isCodeBlock = node.parentNode.nodeName === 'PRE' && !hasSiblings;

        return node.nodeName === 'CODE' && !isCodeBlock
      },

      replacement: function (content) {
        if (!content) return ''
        content = content.replace(/\r?\n|\r/g, ' ');

        var extraSpace = /^`|^ .*?[^ ].* $|`$/.test(content) ? ' ' : '';
        var delimiter = '`';
        var matches = content.match(/`+/gm) || [];
        while (matches.indexOf(delimiter) !== -1) delimiter = delimiter + '`';

        return delimiter + extraSpace + content + extraSpace + delimiter
      }
    };

    rules.image = {
      filter: 'img',

      replacement: function (content, node) {
        var alt = cleanAttribute(node.getAttribute('alt'));
        var src = node.getAttribute('src') || '';
        var title = cleanAttribute(node.getAttribute('title'));
        var titlePart = title ? ' "' + title + '"' : '';
        return src ? '![' + alt + ']' + '(' + src + titlePart + ')' : ''
      }
    };

    function cleanAttribute (attribute) {
      return attribute ? attribute.replace(/(\n+\s*)+/g, '\n') : ''
    }

    /**
     * Manages a collection of rules used to convert HTML to Markdown
     */

    function Rules (options) {
      this.options = options;
      this._keep = [];
      this._remove = [];

      this.blankRule = {
        replacement: options.blankReplacement
      };

      this.keepReplacement = options.keepReplacement;

      this.defaultRule = {
        replacement: options.defaultReplacement
      };

      this.array = [];
      for (var key in options.rules) this.array.push(options.rules[key]);
    }

    Rules.prototype = {
      add: function (key, rule) {
        this.array.unshift(rule);
      },

      keep: function (filter) {
        this._keep.unshift({
          filter: filter,
          replacement: this.keepReplacement
        });
      },

      remove: function (filter) {
        this._remove.unshift({
          filter: filter,
          replacement: function () {
            return ''
          }
        });
      },

      forNode: function (node) {
        if (node.isBlank) return this.blankRule
        var rule;

        if ((rule = findRule(this.array, node, this.options))) return rule
        if ((rule = findRule(this._keep, node, this.options))) return rule
        if ((rule = findRule(this._remove, node, this.options))) return rule

        return this.defaultRule
      },

      forEach: function (fn) {
        for (var i = 0; i < this.array.length; i++) fn(this.array[i], i);
      }
    };

    function findRule (rules, node, options) {
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (filterValue(rule, node, options)) return rule
      }
      return void 0
    }

    function filterValue (rule, node, options) {
      var filter = rule.filter;
      if (typeof filter === 'string') {
        if (filter === node.nodeName.toLowerCase()) return true
      } else if (Array.isArray(filter)) {
        if (filter.indexOf(node.nodeName.toLowerCase()) > -1) return true
      } else if (typeof filter === 'function') {
        if (filter.call(rule, node, options)) return true
      } else {
        throw new TypeError('`filter` needs to be a string, array, or function')
      }
    }

    /**
     * The collapseWhitespace function is adapted from collapse-whitespace
     * by Luc Thevenard.
     *
     * The MIT License (MIT)
     *
     * Copyright (c) 2014 Luc Thevenard <lucthevenard@gmail.com>
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */

    /**
     * collapseWhitespace(options) removes extraneous whitespace from an the given element.
     *
     * @param {Object} options
     */
    function collapseWhitespace (options) {
      var element = options.element;
      var isBlock = options.isBlock;
      var isVoid = options.isVoid;
      var isPre = options.isPre || function (node) {
        return node.nodeName === 'PRE'
      };

      if (!element.firstChild || isPre(element)) return

      var prevText = null;
      var keepLeadingWs = false;

      var prev = null;
      var node = next(prev, element, isPre);

      while (node !== element) {
        if (node.nodeType === 3 || node.nodeType === 4) { // Node.TEXT_NODE or Node.CDATA_SECTION_NODE
          var text = node.data.replace(/[ \r\n\t]+/g, ' ');

          if ((!prevText || / $/.test(prevText.data)) &&
              !keepLeadingWs && text[0] === ' ') {
            text = text.substr(1);
          }

          // `text` might be empty at this point.
          if (!text) {
            node = remove(node);
            continue
          }

          node.data = text;

          prevText = node;
        } else if (node.nodeType === 1) { // Node.ELEMENT_NODE
          if (isBlock(node) || node.nodeName === 'BR') {
            if (prevText) {
              prevText.data = prevText.data.replace(/ $/, '');
            }

            prevText = null;
            keepLeadingWs = false;
          } else if (isVoid(node) || isPre(node)) {
            // Avoid trimming space around non-block, non-BR void elements and inline PRE.
            prevText = null;
            keepLeadingWs = true;
          } else if (prevText) {
            // Drop protection if set previously.
            keepLeadingWs = false;
          }
        } else {
          node = remove(node);
          continue
        }

        var nextNode = next(prev, node, isPre);
        prev = node;
        node = nextNode;
      }

      if (prevText) {
        prevText.data = prevText.data.replace(/ $/, '');
        if (!prevText.data) {
          remove(prevText);
        }
      }
    }

    /**
     * remove(node) removes the given node from the DOM and returns the
     * next node in the sequence.
     *
     * @param {Node} node
     * @return {Node} node
     */
    function remove (node) {
      var next = node.nextSibling || node.parentNode;

      node.parentNode.removeChild(node);

      return next
    }

    /**
     * next(prev, current, isPre) returns the next node in the sequence, given the
     * current and previous nodes.
     *
     * @param {Node} prev
     * @param {Node} current
     * @param {Function} isPre
     * @return {Node}
     */
    function next (prev, current, isPre) {
      if ((prev && prev.parentNode === current) || isPre(current)) {
        return current.nextSibling || current.parentNode
      }

      return current.firstChild || current.nextSibling || current.parentNode
    }

    /*
     * Set up window for Node.js
     */

    var root = (typeof window !== 'undefined' ? window : {});

    /*
     * Parsing HTML strings
     */

    function canParseHTMLNatively () {
      var Parser = root.DOMParser;
      var canParse = false;

      // Adapted from https://gist.github.com/1129031
      // Firefox/Opera/IE throw errors on unsupported types
      try {
        // WebKit returns null on unsupported types
        if (new Parser().parseFromString('', 'text/html')) {
          canParse = true;
        }
      } catch (e) {}

      return canParse
    }

    function createHTMLParser () {
      var Parser = function () {};

      {
        if (shouldUseActiveX()) {
          Parser.prototype.parseFromString = function (string) {
            var doc = new window.ActiveXObject('htmlfile');
            doc.designMode = 'on'; // disable on-page scripts
            doc.open();
            doc.write(string);
            doc.close();
            return doc
          };
        } else {
          Parser.prototype.parseFromString = function (string) {
            var doc = document.implementation.createHTMLDocument('');
            doc.open();
            doc.write(string);
            doc.close();
            return doc
          };
        }
      }
      return Parser
    }

    function shouldUseActiveX () {
      var useActiveX = false;
      try {
        document.implementation.createHTMLDocument('').open();
      } catch (e) {
        if (window.ActiveXObject) useActiveX = true;
      }
      return useActiveX
    }

    var HTMLParser = canParseHTMLNatively() ? root.DOMParser : createHTMLParser();

    function RootNode (input, options) {
      var root;
      if (typeof input === 'string') {
        var doc = htmlParser().parseFromString(
          // DOM parsers arrange elements in the <head> and <body>.
          // Wrapping in a custom element ensures elements are reliably arranged in
          // a single element.
          '<x-turndown id="turndown-root">' + input + '</x-turndown>',
          'text/html'
        );
        root = doc.getElementById('turndown-root');
      } else {
        root = input.cloneNode(true);
      }
      collapseWhitespace({
        element: root,
        isBlock: isBlock,
        isVoid: isVoid,
        isPre: options.preformattedCode ? isPreOrCode : null
      });

      return root
    }

    var _htmlParser;
    function htmlParser () {
      _htmlParser = _htmlParser || new HTMLParser();
      return _htmlParser
    }

    function isPreOrCode (node) {
      return node.nodeName === 'PRE' || node.nodeName === 'CODE'
    }

    function Node (node, options) {
      node.isBlock = isBlock(node);
      node.isCode = node.nodeName === 'CODE' || node.parentNode.isCode;
      node.isBlank = isBlank(node);
      node.flankingWhitespace = flankingWhitespace(node, options);
      return node
    }

    function isBlank (node) {
      return (
        !isVoid(node) &&
        !isMeaningfulWhenBlank(node) &&
        /^\s*$/i.test(node.textContent) &&
        !hasVoid(node) &&
        !hasMeaningfulWhenBlank(node)
      )
    }

    function flankingWhitespace (node, options) {
      if (node.isBlock || (options.preformattedCode && node.isCode)) {
        return { leading: '', trailing: '' }
      }

      var edges = edgeWhitespace(node.textContent);

      // abandon leading ASCII WS if left-flanked by ASCII WS
      if (edges.leadingAscii && isFlankedByWhitespace('left', node, options)) {
        edges.leading = edges.leadingNonAscii;
      }

      // abandon trailing ASCII WS if right-flanked by ASCII WS
      if (edges.trailingAscii && isFlankedByWhitespace('right', node, options)) {
        edges.trailing = edges.trailingNonAscii;
      }

      return { leading: edges.leading, trailing: edges.trailing }
    }

    function edgeWhitespace (string) {
      var m = string.match(/^(([ \t\r\n]*)(\s*))(?:(?=\S)[\s\S]*\S)?((\s*?)([ \t\r\n]*))$/);
      return {
        leading: m[1], // whole string for whitespace-only strings
        leadingAscii: m[2],
        leadingNonAscii: m[3],
        trailing: m[4], // empty for whitespace-only strings
        trailingNonAscii: m[5],
        trailingAscii: m[6]
      }
    }

    function isFlankedByWhitespace (side, node, options) {
      var sibling;
      var regExp;
      var isFlanked;

      if (side === 'left') {
        sibling = node.previousSibling;
        regExp = / $/;
      } else {
        sibling = node.nextSibling;
        regExp = /^ /;
      }

      if (sibling) {
        if (sibling.nodeType === 3) {
          isFlanked = regExp.test(sibling.nodeValue);
        } else if (options.preformattedCode && sibling.nodeName === 'CODE') {
          isFlanked = false;
        } else if (sibling.nodeType === 1 && !isBlock(sibling)) {
          isFlanked = regExp.test(sibling.textContent);
        }
      }
      return isFlanked
    }

    var reduce = Array.prototype.reduce;
    var escapes = [
      [/\\/g, '\\\\'],
      [/\*/g, '\\*'],
      [/^-/g, '\\-'],
      [/^\+ /g, '\\+ '],
      [/^(=+)/g, '\\$1'],
      [/^(#{1,6}) /g, '\\$1 '],
      [/`/g, '\\`'],
      [/^~~~/g, '\\~~~'],
      [/\[/g, '\\['],
      [/\]/g, '\\]'],
      [/^>/g, '\\>'],
      [/_/g, '\\_'],
      [/^(\d+)\. /g, '$1\\. ']
    ];

    function TurndownService (options) {
      if (!(this instanceof TurndownService)) return new TurndownService(options)

      var defaults = {
        rules: rules,
        headingStyle: 'setext',
        hr: '* * *',
        bulletListMarker: '*',
        codeBlockStyle: 'indented',
        fence: '```',
        emDelimiter: '_',
        strongDelimiter: '**',
        linkStyle: 'inlined',
        linkReferenceStyle: 'full',
        br: '  ',
        preformattedCode: false,
        blankReplacement: function (content, node) {
          return node.isBlock ? '\n\n' : ''
        },
        keepReplacement: function (content, node) {
          return node.isBlock ? '\n\n' + node.outerHTML + '\n\n' : node.outerHTML
        },
        defaultReplacement: function (content, node) {
          return node.isBlock ? '\n\n' + content + '\n\n' : content
        }
      };
      this.options = extend$1({}, defaults, options);
      this.rules = new Rules(this.options);
    }

    TurndownService.prototype = {
      /**
       * The entry point for converting a string or DOM node to Markdown
       * @public
       * @param {String|HTMLElement} input The string or DOM node to convert
       * @returns A Markdown representation of the input
       * @type String
       */

      turndown: function (input) {
        if (!canConvert(input)) {
          throw new TypeError(
            input + ' is not a string, or an element/document/fragment node.'
          )
        }

        if (input === '') return ''

        var output = process$1.call(this, new RootNode(input, this.options));
        return postProcess.call(this, output)
      },

      /**
       * Add one or more plugins
       * @public
       * @param {Function|Array} plugin The plugin or array of plugins to add
       * @returns The Turndown instance for chaining
       * @type Object
       */

      use: function (plugin) {
        if (Array.isArray(plugin)) {
          for (var i = 0; i < plugin.length; i++) this.use(plugin[i]);
        } else if (typeof plugin === 'function') {
          plugin(this);
        } else {
          throw new TypeError('plugin must be a Function or an Array of Functions')
        }
        return this
      },

      /**
       * Adds a rule
       * @public
       * @param {String} key The unique key of the rule
       * @param {Object} rule The rule
       * @returns The Turndown instance for chaining
       * @type Object
       */

      addRule: function (key, rule) {
        this.rules.add(key, rule);
        return this
      },

      /**
       * Keep a node (as HTML) that matches the filter
       * @public
       * @param {String|Array|Function} filter The unique key of the rule
       * @returns The Turndown instance for chaining
       * @type Object
       */

      keep: function (filter) {
        this.rules.keep(filter);
        return this
      },

      /**
       * Remove a node that matches the filter
       * @public
       * @param {String|Array|Function} filter The unique key of the rule
       * @returns The Turndown instance for chaining
       * @type Object
       */

      remove: function (filter) {
        this.rules.remove(filter);
        return this
      },

      /**
       * Escapes Markdown syntax
       * @public
       * @param {String} string The string to escape
       * @returns A string with Markdown syntax escaped
       * @type String
       */

      escape: function (string) {
        return escapes.reduce(function (accumulator, escape) {
          return accumulator.replace(escape[0], escape[1])
        }, string)
      }
    };

    /**
     * Reduces a DOM node down to its Markdown string equivalent
     * @private
     * @param {HTMLElement} parentNode The node to convert
     * @returns A Markdown representation of the node
     * @type String
     */

    function process$1 (parentNode) {
      var self = this;
      return reduce.call(parentNode.childNodes, function (output, node) {
        node = new Node(node, self.options);

        var replacement = '';
        if (node.nodeType === 3) {
          replacement = node.isCode ? node.nodeValue : self.escape(node.nodeValue);
        } else if (node.nodeType === 1) {
          replacement = replacementForNode.call(self, node);
        }

        return join(output, replacement)
      }, '')
    }

    /**
     * Appends strings as each rule requires and trims the output
     * @private
     * @param {String} output The conversion output
     * @returns A trimmed version of the ouput
     * @type String
     */

    function postProcess (output) {
      var self = this;
      this.rules.forEach(function (rule) {
        if (typeof rule.append === 'function') {
          output = join(output, rule.append(self.options));
        }
      });

      return output.replace(/^[\t\r\n]+/, '').replace(/[\t\r\n\s]+$/, '')
    }

    /**
     * Converts an element node to its Markdown equivalent
     * @private
     * @param {HTMLElement} node The node to convert
     * @returns A Markdown representation of the node
     * @type String
     */

    function replacementForNode (node) {
      var rule = this.rules.forNode(node);
      var content = process$1.call(this, node);
      var whitespace = node.flankingWhitespace;
      if (whitespace.leading || whitespace.trailing) content = content.trim();
      return (
        whitespace.leading +
        rule.replacement(content, node, this.options) +
        whitespace.trailing
      )
    }

    /**
     * Joins replacement to the current output with appropriate number of new lines
     * @private
     * @param {String} output The current conversion output
     * @param {String} replacement The string to append to the output
     * @returns Joined output
     * @type String
     */

    function join (output, replacement) {
      var s1 = trimTrailingNewlines(output);
      var s2 = trimLeadingNewlines(replacement);
      var nls = Math.max(output.length - s1.length, replacement.length - s2.length);
      var separator = '\n\n'.substring(0, nls);

      return s1 + separator + s2
    }

    /**
     * Determines whether an input can be converted
     * @private
     * @param {String|HTMLElement} input Describe this parameter
     * @returns Describe what it returns
     * @type String|Object|Array|Boolean|Number
     */

    function canConvert (input) {
      return (
        input != null && (
          typeof input === 'string' ||
          (input.nodeType && (
            input.nodeType === 1 || input.nodeType === 9 || input.nodeType === 11
          ))
        )
      )
    }

    /* src/Container.svelte generated by Svelte v3.58.0 */

    function create_else_block$1(ctx) {
    	let t0;
    	let button;
    	let mounted;
    	let dispose;
    	let if_block = (/*probablyReaderable*/ ctx[0] || true) && create_if_block_1(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			t0 = space();
    			button = element("button");
    			button.textContent = "highlight";
    			attr(button, "class", "bg-black text-white svelte-wpu8if");
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, t0, anchor);
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", /*highlightText*/ ctx[2]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (/*probablyReaderable*/ ctx[0] || true) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1(ctx);
    					if_block.c();
    					if_block.m(t0.parentNode, t0);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (91:0) {#if !$ndk?.signer}
    function create_if_block$1(ctx) {
    	let keyprompt;
    	let current;
    	keyprompt = new KeyPrompt({});

    	return {
    		c() {
    			create_component(keyprompt.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(keyprompt, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(keyprompt.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(keyprompt.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(keyprompt, detaching);
    		}
    	};
    }

    // (94:4) {#if probablyReaderable || true}
    function create_if_block_1(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			button.textContent = "Publish as NIP-23";
    			attr(button, "class", "svelte-wpu8if");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", /*publishNip28*/ ctx[3]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$1, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (!/*$ndk*/ ctx[1]?.signer) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function markHighlightInDoc(range) {
    	const selectedText = range?.toString();
    	const span = document.createElement("span");
    	span.style.backgroundColor = "yellow";
    	span.textContent = selectedText;
    	range.deleteContents();
    	range.insertNode(span);
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let $ndk;
    	component_subscribe($$self, ndk, $$value => $$invalidate(1, $ndk = $$value));
    	let probablyReaderable;

    	async function highlightText() {
    		const selection = window.getSelection();
    		const range = selection?.getRangeAt(0);
    		if (!range) return;
    		const selectedText = range.toString();
    		markHighlightInDoc(range);
    		const url = new URL(window.location.href);
    		const pathParts = url.pathname.split("/");
    		const lastPathPart = pathParts[pathParts.length - 1];
    		let naddr;
    		let tags = [];

    		if (lastPathPart.startsWith("naddr")) {
    			naddr = lastPathPart;
    			const decode = nip19_exports.decode(naddr).data;
    			if (!decode) return;
    			const id = `${decode.kind}:${decode.pubkey}:${decode.identifier}`;
    			tags.push(["a", id]);
    			tags.push(["p", decode.pubkey]);
    		}

    		const event = new NDKEvent($ndk,
    		{
    				kind: 9801,
    				content: selectedText,
    				created_at: Math.floor(Date.now() / 1e3),
    				tags: [["r", window.location.href], ...tags]
    			});

    		await event.sign();
    		console.log(await event.toNostrEvent());
    		await $ndk.publish(event);
    	}

    	async function publishNip28() {
    		const reader = new readability.Readability(document);
    		let article;
    		let tags = [];

    		try {
    			article = reader.parse();
    			if (!article) return;
    		} catch(e) {
    			alert(e.message);
    			return;
    		}

    		article.title && tags.push(["title", article.title]);
    		article.excerpt && tags.push(["excerpt", article.excerpt]);
    		article.siteName && tags.push(["siteName", article.siteName]);
    		article.byline && tags.push(["byline", article.byline]);
    		article.textContent && tags.push(["textContent", article.textContent]);
    		article.length && tags.push(["length", article.length.toString()]);
    		tags.push(["r", window.location.href]);
    		tags.push(["published_at", Math.floor(Date.now() / 1e3).toString()]);
    		const turndownService = new TurndownService();
    		const content = turndownService.turndown(article.content);

    		const postEvent = new NDKEvent($ndk,
    		{
    				kind: 9801,
    				content,
    				created_at: Math.floor(Date.now() / 1e3),
    				tags
    			});

    		console.log(await postEvent.toNostrEvent());
    		await postEvent.sign();
    		alert(await postEvent.encode());
    		await $ndk.publish(postEvent);
    	}

    	onMount(() => {
    		new readability.Readability(document);
    		$$invalidate(0, probablyReaderable = readability.isProbablyReaderable(document));
    		$ndk.connect();
    	});

    	return [probablyReaderable, $ndk, highlightText, publishNip28];
    }

    class Container extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});
    	}
    }

    /*
     * Dexie.js - a minimalistic wrapper for IndexedDB
     * ===============================================
     *
     * By David Fahlander, david.fahlander@gmail.com
     *
     * Version 4.0.1-alpha.10, Wed Mar 29 2023
     *
     * https://dexie.org
     *
     * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
     */
     
    const _global = typeof globalThis !== 'undefined' ? globalThis :
        typeof self !== 'undefined' ? self :
            typeof window !== 'undefined' ? window :
                global;

    const keys = Object.keys;
    const isArray = Array.isArray;
    if (typeof Promise !== 'undefined' && !_global.Promise) {
        _global.Promise = Promise;
    }
    function extend(obj, extension) {
        if (typeof extension !== 'object')
            return obj;
        keys(extension).forEach(function (key) {
            obj[key] = extension[key];
        });
        return obj;
    }
    const getProto = Object.getPrototypeOf;
    const _hasOwn = {}.hasOwnProperty;
    function hasOwn(obj, prop) {
        return _hasOwn.call(obj, prop);
    }
    function props(proto, extension) {
        if (typeof extension === 'function')
            extension = extension(getProto(proto));
        (typeof Reflect === "undefined" ? keys : Reflect.ownKeys)(extension).forEach(key => {
            setProp(proto, key, extension[key]);
        });
    }
    const defineProperty = Object.defineProperty;
    function setProp(obj, prop, functionOrGetSet, options) {
        defineProperty(obj, prop, extend(functionOrGetSet && hasOwn(functionOrGetSet, "get") && typeof functionOrGetSet.get === 'function' ?
            { get: functionOrGetSet.get, set: functionOrGetSet.set, configurable: true } :
            { value: functionOrGetSet, configurable: true, writable: true }, options));
    }
    function derive(Child) {
        return {
            from: function (Parent) {
                Child.prototype = Object.create(Parent.prototype);
                setProp(Child.prototype, "constructor", Child);
                return {
                    extend: props.bind(null, Child.prototype)
                };
            }
        };
    }
    const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    function getPropertyDescriptor(obj, prop) {
        const pd = getOwnPropertyDescriptor(obj, prop);
        let proto;
        return pd || (proto = getProto(obj)) && getPropertyDescriptor(proto, prop);
    }
    const _slice = [].slice;
    function slice(args, start, end) {
        return _slice.call(args, start, end);
    }
    function override(origFunc, overridedFactory) {
        return overridedFactory(origFunc);
    }
    function assert(b) {
        if (!b)
            throw new Error("Assertion Failed");
    }
    function asap$1(fn) {
        if (_global.setImmediate)
            setImmediate(fn);
        else
            setTimeout(fn, 0);
    }
    function arrayToObject(array, extractor) {
        return array.reduce((result, item, i) => {
            var nameAndValue = extractor(item, i);
            if (nameAndValue)
                result[nameAndValue[0]] = nameAndValue[1];
            return result;
        }, {});
    }
    function tryCatch(fn, onerror, args) {
        try {
            fn.apply(null, args);
        }
        catch (ex) {
            onerror && onerror(ex);
        }
    }
    function getByKeyPath(obj, keyPath) {
        if (hasOwn(obj, keyPath))
            return obj[keyPath];
        if (!keyPath)
            return obj;
        if (typeof keyPath !== 'string') {
            var rv = [];
            for (var i = 0, l = keyPath.length; i < l; ++i) {
                var val = getByKeyPath(obj, keyPath[i]);
                rv.push(val);
            }
            return rv;
        }
        var period = keyPath.indexOf('.');
        if (period !== -1) {
            var innerObj = obj[keyPath.substr(0, period)];
            return innerObj === undefined ? undefined : getByKeyPath(innerObj, keyPath.substr(period + 1));
        }
        return undefined;
    }
    function setByKeyPath(obj, keyPath, value) {
        if (!obj || keyPath === undefined)
            return;
        if ('isFrozen' in Object && Object.isFrozen(obj))
            return;
        if (typeof keyPath !== 'string' && 'length' in keyPath) {
            assert(typeof value !== 'string' && 'length' in value);
            for (var i = 0, l = keyPath.length; i < l; ++i) {
                setByKeyPath(obj, keyPath[i], value[i]);
            }
        }
        else {
            var period = keyPath.indexOf('.');
            if (period !== -1) {
                var currentKeyPath = keyPath.substr(0, period);
                var remainingKeyPath = keyPath.substr(period + 1);
                if (remainingKeyPath === "")
                    if (value === undefined) {
                        if (isArray(obj) && !isNaN(parseInt(currentKeyPath)))
                            obj.splice(currentKeyPath, 1);
                        else
                            delete obj[currentKeyPath];
                    }
                    else
                        obj[currentKeyPath] = value;
                else {
                    var innerObj = obj[currentKeyPath];
                    if (!innerObj || !hasOwn(obj, currentKeyPath))
                        innerObj = (obj[currentKeyPath] = {});
                    setByKeyPath(innerObj, remainingKeyPath, value);
                }
            }
            else {
                if (value === undefined) {
                    if (isArray(obj) && !isNaN(parseInt(keyPath)))
                        obj.splice(keyPath, 1);
                    else
                        delete obj[keyPath];
                }
                else
                    obj[keyPath] = value;
            }
        }
    }
    function delByKeyPath(obj, keyPath) {
        if (typeof keyPath === 'string')
            setByKeyPath(obj, keyPath, undefined);
        else if ('length' in keyPath)
            [].map.call(keyPath, function (kp) {
                setByKeyPath(obj, kp, undefined);
            });
    }
    function shallowClone(obj) {
        var rv = {};
        for (var m in obj) {
            if (hasOwn(obj, m))
                rv[m] = obj[m];
        }
        return rv;
    }
    const concat = [].concat;
    function flatten(a) {
        return concat.apply([], a);
    }
    const intrinsicTypeNames = "Boolean,String,Date,RegExp,Blob,File,FileList,FileSystemFileHandle,FileSystemDirectoryHandle,ArrayBuffer,DataView,Uint8ClampedArray,ImageBitmap,ImageData,Map,Set,CryptoKey"
        .split(',').concat(flatten([8, 16, 32, 64].map(num => ["Int", "Uint", "Float"].map(t => t + num + "Array")))).filter(t => _global[t]);
    const intrinsicTypes = intrinsicTypeNames.map(t => _global[t]);
    arrayToObject(intrinsicTypeNames, x => [x, true]);
    let circularRefs = null;
    function deepClone(any) {
        circularRefs = typeof WeakMap !== 'undefined' && new WeakMap();
        const rv = innerDeepClone(any);
        circularRefs = null;
        return rv;
    }
    function innerDeepClone(any) {
        if (!any || typeof any !== 'object')
            return any;
        let rv = circularRefs && circularRefs.get(any);
        if (rv)
            return rv;
        if (isArray(any)) {
            rv = [];
            circularRefs && circularRefs.set(any, rv);
            for (var i = 0, l = any.length; i < l; ++i) {
                rv.push(innerDeepClone(any[i]));
            }
        }
        else if (intrinsicTypes.indexOf(any.constructor) >= 0) {
            rv = any;
        }
        else {
            const proto = getProto(any);
            rv = proto === Object.prototype ? {} : Object.create(proto);
            circularRefs && circularRefs.set(any, rv);
            for (var prop in any) {
                if (hasOwn(any, prop)) {
                    rv[prop] = innerDeepClone(any[prop]);
                }
            }
        }
        return rv;
    }
    const { toString } = {};
    function toStringTag(o) {
        return toString.call(o).slice(8, -1);
    }
    const iteratorSymbol = typeof Symbol !== 'undefined' ?
        Symbol.iterator :
        '@@iterator';
    const getIteratorOf = typeof iteratorSymbol === "symbol" ? function (x) {
        var i;
        return x != null && (i = x[iteratorSymbol]) && i.apply(x);
    } : function () { return null; };
    const NO_CHAR_ARRAY = {};
    function getArrayOf(arrayLike) {
        var i, a, x, it;
        if (arguments.length === 1) {
            if (isArray(arrayLike))
                return arrayLike.slice();
            if (this === NO_CHAR_ARRAY && typeof arrayLike === 'string')
                return [arrayLike];
            if ((it = getIteratorOf(arrayLike))) {
                a = [];
                while ((x = it.next()), !x.done)
                    a.push(x.value);
                return a;
            }
            if (arrayLike == null)
                return [arrayLike];
            i = arrayLike.length;
            if (typeof i === 'number') {
                a = new Array(i);
                while (i--)
                    a[i] = arrayLike[i];
                return a;
            }
            return [arrayLike];
        }
        i = arguments.length;
        a = new Array(i);
        while (i--)
            a[i] = arguments[i];
        return a;
    }
    const isAsyncFunction = typeof Symbol !== 'undefined'
        ? (fn) => fn[Symbol.toStringTag] === 'AsyncFunction'
        : () => false;

    var debug = typeof location !== 'undefined' &&
        /^(http|https):\/\/(localhost|127\.0\.0\.1)/.test(location.href);
    function setDebug(value, filter) {
        debug = value;
        libraryFilter = filter;
    }
    var libraryFilter = () => true;
    const NEEDS_THROW_FOR_STACK = !new Error("").stack;
    function getErrorWithStack() {
        if (NEEDS_THROW_FOR_STACK)
            try {
                getErrorWithStack.arguments;
                throw new Error();
            }
            catch (e) {
                return e;
            }
        return new Error();
    }
    function prettyStack(exception, numIgnoredFrames) {
        var stack = exception.stack;
        if (!stack)
            return "";
        numIgnoredFrames = (numIgnoredFrames || 0);
        if (stack.indexOf(exception.name) === 0)
            numIgnoredFrames += (exception.name + exception.message).split('\n').length;
        return stack.split('\n')
            .slice(numIgnoredFrames)
            .filter(libraryFilter)
            .map(frame => "\n" + frame)
            .join('');
    }

    var dexieErrorNames = [
        'Modify',
        'Bulk',
        'OpenFailed',
        'VersionChange',
        'Schema',
        'Upgrade',
        'InvalidTable',
        'MissingAPI',
        'NoSuchDatabase',
        'InvalidArgument',
        'SubTransaction',
        'Unsupported',
        'Internal',
        'DatabaseClosed',
        'PrematureCommit',
        'ForeignAwait'
    ];
    var idbDomErrorNames = [
        'Unknown',
        'Constraint',
        'Data',
        'TransactionInactive',
        'ReadOnly',
        'Version',
        'NotFound',
        'InvalidState',
        'InvalidAccess',
        'Abort',
        'Timeout',
        'QuotaExceeded',
        'Syntax',
        'DataClone'
    ];
    var errorList = dexieErrorNames.concat(idbDomErrorNames);
    var defaultTexts = {
        VersionChanged: "Database version changed by other database connection",
        DatabaseClosed: "Database has been closed",
        Abort: "Transaction aborted",
        TransactionInactive: "Transaction has already completed or failed",
        MissingAPI: "IndexedDB API missing. Please visit https://tinyurl.com/y2uuvskb"
    };
    function DexieError(name, msg) {
        this._e = getErrorWithStack();
        this.name = name;
        this.message = msg;
    }
    derive(DexieError).from(Error).extend({
        stack: {
            get: function () {
                return this._stack ||
                    (this._stack = this.name + ": " + this.message + prettyStack(this._e, 2));
            }
        },
        toString: function () { return this.name + ": " + this.message; }
    });
    function getMultiErrorMessage(msg, failures) {
        return msg + ". Errors: " + Object.keys(failures)
            .map(key => failures[key].toString())
            .filter((v, i, s) => s.indexOf(v) === i)
            .join('\n');
    }
    function ModifyError(msg, failures, successCount, failedKeys) {
        this._e = getErrorWithStack();
        this.failures = failures;
        this.failedKeys = failedKeys;
        this.successCount = successCount;
        this.message = getMultiErrorMessage(msg, failures);
    }
    derive(ModifyError).from(DexieError);
    function BulkError(msg, failures) {
        this._e = getErrorWithStack();
        this.name = "BulkError";
        this.failures = Object.keys(failures).map(pos => failures[pos]);
        this.failuresByPos = failures;
        this.message = getMultiErrorMessage(msg, this.failures);
    }
    derive(BulkError).from(DexieError);
    var errnames = errorList.reduce((obj, name) => (obj[name] = name + "Error", obj), {});
    const BaseException = DexieError;
    var exceptions = errorList.reduce((obj, name) => {
        var fullName = name + "Error";
        function DexieError(msgOrInner, inner) {
            this._e = getErrorWithStack();
            this.name = fullName;
            if (!msgOrInner) {
                this.message = defaultTexts[name] || fullName;
                this.inner = null;
            }
            else if (typeof msgOrInner === 'string') {
                this.message = `${msgOrInner}${!inner ? '' : '\n ' + inner}`;
                this.inner = inner || null;
            }
            else if (typeof msgOrInner === 'object') {
                this.message = `${msgOrInner.name} ${msgOrInner.message}`;
                this.inner = msgOrInner;
            }
        }
        derive(DexieError).from(BaseException);
        obj[name] = DexieError;
        return obj;
    }, {});
    exceptions.Syntax = SyntaxError;
    exceptions.Type = TypeError;
    exceptions.Range = RangeError;
    var exceptionMap = idbDomErrorNames.reduce((obj, name) => {
        obj[name + "Error"] = exceptions[name];
        return obj;
    }, {});
    function mapError(domError, message) {
        if (!domError || domError instanceof DexieError || domError instanceof TypeError || domError instanceof SyntaxError || !domError.name || !exceptionMap[domError.name])
            return domError;
        var rv = new exceptionMap[domError.name](message || domError.message, domError);
        if ("stack" in domError) {
            setProp(rv, "stack", { get: function () {
                    return this.inner.stack;
                } });
        }
        return rv;
    }
    var fullNameExceptions = errorList.reduce((obj, name) => {
        if (["Syntax", "Type", "Range"].indexOf(name) === -1)
            obj[name + "Error"] = exceptions[name];
        return obj;
    }, {});
    fullNameExceptions.ModifyError = ModifyError;
    fullNameExceptions.DexieError = DexieError;
    fullNameExceptions.BulkError = BulkError;

    function nop() { }
    function mirror(val) { return val; }
    function pureFunctionChain(f1, f2) {
        if (f1 == null || f1 === mirror)
            return f2;
        return function (val) {
            return f2(f1(val));
        };
    }
    function callBoth(on1, on2) {
        return function () {
            on1.apply(this, arguments);
            on2.apply(this, arguments);
        };
    }
    function hookCreatingChain(f1, f2) {
        if (f1 === nop)
            return f2;
        return function () {
            var res = f1.apply(this, arguments);
            if (res !== undefined)
                arguments[0] = res;
            var onsuccess = this.onsuccess,
            onerror = this.onerror;
            this.onsuccess = null;
            this.onerror = null;
            var res2 = f2.apply(this, arguments);
            if (onsuccess)
                this.onsuccess = this.onsuccess ? callBoth(onsuccess, this.onsuccess) : onsuccess;
            if (onerror)
                this.onerror = this.onerror ? callBoth(onerror, this.onerror) : onerror;
            return res2 !== undefined ? res2 : res;
        };
    }
    function hookDeletingChain(f1, f2) {
        if (f1 === nop)
            return f2;
        return function () {
            f1.apply(this, arguments);
            var onsuccess = this.onsuccess,
            onerror = this.onerror;
            this.onsuccess = this.onerror = null;
            f2.apply(this, arguments);
            if (onsuccess)
                this.onsuccess = this.onsuccess ? callBoth(onsuccess, this.onsuccess) : onsuccess;
            if (onerror)
                this.onerror = this.onerror ? callBoth(onerror, this.onerror) : onerror;
        };
    }
    function hookUpdatingChain(f1, f2) {
        if (f1 === nop)
            return f2;
        return function (modifications) {
            var res = f1.apply(this, arguments);
            extend(modifications, res);
            var onsuccess = this.onsuccess,
            onerror = this.onerror;
            this.onsuccess = null;
            this.onerror = null;
            var res2 = f2.apply(this, arguments);
            if (onsuccess)
                this.onsuccess = this.onsuccess ? callBoth(onsuccess, this.onsuccess) : onsuccess;
            if (onerror)
                this.onerror = this.onerror ? callBoth(onerror, this.onerror) : onerror;
            return res === undefined ?
                (res2 === undefined ? undefined : res2) :
                (extend(res, res2));
        };
    }
    function reverseStoppableEventChain(f1, f2) {
        if (f1 === nop)
            return f2;
        return function () {
            if (f2.apply(this, arguments) === false)
                return false;
            return f1.apply(this, arguments);
        };
    }
    function promisableChain(f1, f2) {
        if (f1 === nop)
            return f2;
        return function () {
            var res = f1.apply(this, arguments);
            if (res && typeof res.then === 'function') {
                var thiz = this, i = arguments.length, args = new Array(i);
                while (i--)
                    args[i] = arguments[i];
                return res.then(function () {
                    return f2.apply(thiz, args);
                });
            }
            return f2.apply(this, arguments);
        };
    }

    var INTERNAL = {};
    const LONG_STACKS_CLIP_LIMIT = 100,
    MAX_LONG_STACKS = 20, ZONE_ECHO_LIMIT = 100, [resolvedNativePromise, nativePromiseProto, resolvedGlobalPromise] = typeof Promise === 'undefined' ?
        [] :
        (() => {
            let globalP = Promise.resolve();
            if (typeof crypto === 'undefined' || !crypto.subtle)
                return [globalP, getProto(globalP), globalP];
            const nativeP = crypto.subtle.digest("SHA-512", new Uint8Array([0]));
            return [
                nativeP,
                getProto(nativeP),
                globalP
            ];
        })(), nativePromiseThen = nativePromiseProto && nativePromiseProto.then;
    const NativePromise = resolvedNativePromise && resolvedNativePromise.constructor;
    const patchGlobalPromise = !!resolvedGlobalPromise;
    var stack_being_generated = false;
    var schedulePhysicalTick = resolvedGlobalPromise ?
        () => { resolvedGlobalPromise.then(physicalTick); }
        :
            _global.setImmediate ?
                setImmediate.bind(null, physicalTick) :
                _global.MutationObserver ?
                    () => {
                        var hiddenDiv = document.createElement("div");
                        (new MutationObserver(() => {
                            physicalTick();
                            hiddenDiv = null;
                        })).observe(hiddenDiv, { attributes: true });
                        hiddenDiv.setAttribute('i', '1');
                    } :
                    () => { setTimeout(physicalTick, 0); };
    var asap = function (callback, args) {
        microtickQueue.push([callback, args]);
        if (needsNewPhysicalTick) {
            schedulePhysicalTick();
            needsNewPhysicalTick = false;
        }
    };
    var isOutsideMicroTick = true,
    needsNewPhysicalTick = true,
    unhandledErrors = [],
    rejectingErrors = [],
    currentFulfiller = null, rejectionMapper = mirror;
    var globalPSD = {
        id: 'global',
        global: true,
        ref: 0,
        unhandleds: [],
        onunhandled: globalError,
        pgp: false,
        env: {},
        finalize: function () {
            this.unhandleds.forEach(uh => {
                try {
                    globalError(uh[0], uh[1]);
                }
                catch (e) { }
            });
        }
    };
    var PSD = globalPSD;
    var microtickQueue = [];
    var numScheduledCalls = 0;
    var tickFinalizers = [];
    function DexiePromise(fn) {
        if (typeof this !== 'object')
            throw new TypeError('Promises must be constructed via new');
        this._listeners = [];
        this.onuncatched = nop;
        this._lib = false;
        var psd = (this._PSD = PSD);
        if (debug) {
            this._stackHolder = getErrorWithStack();
            this._prev = null;
            this._numPrev = 0;
        }
        if (typeof fn !== 'function') {
            if (fn !== INTERNAL)
                throw new TypeError('Not a function');
            this._state = arguments[1];
            this._value = arguments[2];
            if (this._state === false)
                handleRejection(this, this._value);
            return;
        }
        this._state = null;
        this._value = null;
        ++psd.ref;
        executePromiseTask(this, fn);
    }
    const thenProp = {
        get: function () {
            var psd = PSD, microTaskId = totalEchoes;
            function then(onFulfilled, onRejected) {
                var possibleAwait = !psd.global && (psd !== PSD || microTaskId !== totalEchoes);
                const cleanup = possibleAwait && !decrementExpectedAwaits();
                var rv = new DexiePromise((resolve, reject) => {
                    propagateToListener(this, new Listener(nativeAwaitCompatibleWrap(onFulfilled, psd, possibleAwait, cleanup), nativeAwaitCompatibleWrap(onRejected, psd, possibleAwait, cleanup), resolve, reject, psd));
                });
                debug && linkToPreviousPromise(rv, this);
                return rv;
            }
            then.prototype = INTERNAL;
            return then;
        },
        set: function (value) {
            setProp(this, 'then', value && value.prototype === INTERNAL ?
                thenProp :
                {
                    get: function () {
                        return value;
                    },
                    set: thenProp.set
                });
        }
    };
    props(DexiePromise.prototype, {
        then: thenProp,
        _then: function (onFulfilled, onRejected) {
            propagateToListener(this, new Listener(null, null, onFulfilled, onRejected, PSD));
        },
        catch: function (onRejected) {
            if (arguments.length === 1)
                return this.then(null, onRejected);
            var type = arguments[0], handler = arguments[1];
            return typeof type === 'function' ? this.then(null, err =>
            err instanceof type ? handler(err) : PromiseReject(err))
                : this.then(null, err =>
                err && err.name === type ? handler(err) : PromiseReject(err));
        },
        finally: function (onFinally) {
            return this.then(value => {
                onFinally();
                return value;
            }, err => {
                onFinally();
                return PromiseReject(err);
            });
        },
        stack: {
            get: function () {
                if (this._stack)
                    return this._stack;
                try {
                    stack_being_generated = true;
                    var stacks = getStack(this, [], MAX_LONG_STACKS);
                    var stack = stacks.join("\nFrom previous: ");
                    if (this._state !== null)
                        this._stack = stack;
                    return stack;
                }
                finally {
                    stack_being_generated = false;
                }
            }
        },
        timeout: function (ms, msg) {
            return ms < Infinity ?
                new DexiePromise((resolve, reject) => {
                    var handle = setTimeout(() => reject(new exceptions.Timeout(msg)), ms);
                    this.then(resolve, reject).finally(clearTimeout.bind(null, handle));
                }) : this;
        }
    });
    if (typeof Symbol !== 'undefined' && Symbol.toStringTag)
        setProp(DexiePromise.prototype, Symbol.toStringTag, 'Dexie.Promise');
    globalPSD.env = snapShot();
    function Listener(onFulfilled, onRejected, resolve, reject, zone) {
        this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
        this.onRejected = typeof onRejected === 'function' ? onRejected : null;
        this.resolve = resolve;
        this.reject = reject;
        this.psd = zone;
    }
    props(DexiePromise, {
        all: function () {
            var values = getArrayOf.apply(null, arguments)
                .map(onPossibleParallellAsync);
            return new DexiePromise(function (resolve, reject) {
                if (values.length === 0)
                    resolve([]);
                var remaining = values.length;
                values.forEach((a, i) => DexiePromise.resolve(a).then(x => {
                    values[i] = x;
                    if (!--remaining)
                        resolve(values);
                }, reject));
            });
        },
        resolve: value => {
            if (value instanceof DexiePromise)
                return value;
            if (value && typeof value.then === 'function')
                return new DexiePromise((resolve, reject) => {
                    value.then(resolve, reject);
                });
            var rv = new DexiePromise(INTERNAL, true, value);
            linkToPreviousPromise(rv, currentFulfiller);
            return rv;
        },
        reject: PromiseReject,
        race: function () {
            var values = getArrayOf.apply(null, arguments).map(onPossibleParallellAsync);
            return new DexiePromise((resolve, reject) => {
                values.map(value => DexiePromise.resolve(value).then(resolve, reject));
            });
        },
        PSD: {
            get: () => PSD,
            set: value => PSD = value
        },
        totalEchoes: { get: () => totalEchoes },
        newPSD: newScope,
        usePSD: usePSD,
        scheduler: {
            get: () => asap,
            set: value => { asap = value; }
        },
        rejectionMapper: {
            get: () => rejectionMapper,
            set: value => { rejectionMapper = value; }
        },
        follow: (fn, zoneProps) => {
            return new DexiePromise((resolve, reject) => {
                return newScope((resolve, reject) => {
                    var psd = PSD;
                    psd.unhandleds = [];
                    psd.onunhandled = reject;
                    psd.finalize = callBoth(function () {
                        run_at_end_of_this_or_next_physical_tick(() => {
                            this.unhandleds.length === 0 ? resolve() : reject(this.unhandleds[0]);
                        });
                    }, psd.finalize);
                    fn();
                }, zoneProps, resolve, reject);
            });
        }
    });
    if (NativePromise) {
        if (NativePromise.allSettled)
            setProp(DexiePromise, "allSettled", function () {
                const possiblePromises = getArrayOf.apply(null, arguments).map(onPossibleParallellAsync);
                return new DexiePromise(resolve => {
                    if (possiblePromises.length === 0)
                        resolve([]);
                    let remaining = possiblePromises.length;
                    const results = new Array(remaining);
                    possiblePromises.forEach((p, i) => DexiePromise.resolve(p).then(value => results[i] = { status: "fulfilled", value }, reason => results[i] = { status: "rejected", reason })
                        .then(() => --remaining || resolve(results)));
                });
            });
        if (NativePromise.any && typeof AggregateError !== 'undefined')
            setProp(DexiePromise, "any", function () {
                const possiblePromises = getArrayOf.apply(null, arguments).map(onPossibleParallellAsync);
                return new DexiePromise((resolve, reject) => {
                    if (possiblePromises.length === 0)
                        reject(new AggregateError([]));
                    let remaining = possiblePromises.length;
                    const failures = new Array(remaining);
                    possiblePromises.forEach((p, i) => DexiePromise.resolve(p).then(value => resolve(value), failure => {
                        failures[i] = failure;
                        if (!--remaining)
                            reject(new AggregateError(failures));
                    }));
                });
            });
    }
    function executePromiseTask(promise, fn) {
        try {
            fn(value => {
                if (promise._state !== null)
                    return;
                if (value === promise)
                    throw new TypeError('A promise cannot be resolved with itself.');
                var shouldExecuteTick = promise._lib && beginMicroTickScope();
                if (value && typeof value.then === 'function') {
                    executePromiseTask(promise, (resolve, reject) => {
                        value instanceof DexiePromise ?
                            value._then(resolve, reject) :
                            value.then(resolve, reject);
                    });
                }
                else {
                    promise._state = true;
                    promise._value = value;
                    propagateAllListeners(promise);
                }
                if (shouldExecuteTick)
                    endMicroTickScope();
            }, handleRejection.bind(null, promise));
        }
        catch (ex) {
            handleRejection(promise, ex);
        }
    }
    function handleRejection(promise, reason) {
        rejectingErrors.push(reason);
        if (promise._state !== null)
            return;
        var shouldExecuteTick = promise._lib && beginMicroTickScope();
        reason = rejectionMapper(reason);
        promise._state = false;
        promise._value = reason;
        debug && reason !== null && typeof reason === 'object' && !reason._promise && tryCatch(() => {
            var origProp = getPropertyDescriptor(reason, "stack");
            reason._promise = promise;
            setProp(reason, "stack", {
                get: () => stack_being_generated ?
                    origProp && (origProp.get ?
                        origProp.get.apply(reason) :
                        origProp.value) :
                    promise.stack
            });
        });
        addPossiblyUnhandledError(promise);
        propagateAllListeners(promise);
        if (shouldExecuteTick)
            endMicroTickScope();
    }
    function propagateAllListeners(promise) {
        var listeners = promise._listeners;
        promise._listeners = [];
        for (var i = 0, len = listeners.length; i < len; ++i) {
            propagateToListener(promise, listeners[i]);
        }
        var psd = promise._PSD;
        --psd.ref || psd.finalize();
        if (numScheduledCalls === 0) {
            ++numScheduledCalls;
            asap(() => {
                if (--numScheduledCalls === 0)
                    finalizePhysicalTick();
            }, []);
        }
    }
    function propagateToListener(promise, listener) {
        if (promise._state === null) {
            promise._listeners.push(listener);
            return;
        }
        var cb = promise._state ? listener.onFulfilled : listener.onRejected;
        if (cb === null) {
            return (promise._state ? listener.resolve : listener.reject)(promise._value);
        }
        ++listener.psd.ref;
        ++numScheduledCalls;
        asap(callListener, [cb, promise, listener]);
    }
    function callListener(cb, promise, listener) {
        try {
            currentFulfiller = promise;
            var ret, value = promise._value;
            if (promise._state) {
                ret = cb(value);
            }
            else {
                if (rejectingErrors.length)
                    rejectingErrors = [];
                ret = cb(value);
                if (rejectingErrors.indexOf(value) === -1)
                    markErrorAsHandled(promise);
            }
            listener.resolve(ret);
        }
        catch (e) {
            listener.reject(e);
        }
        finally {
            currentFulfiller = null;
            if (--numScheduledCalls === 0)
                finalizePhysicalTick();
            --listener.psd.ref || listener.psd.finalize();
        }
    }
    function getStack(promise, stacks, limit) {
        if (stacks.length === limit)
            return stacks;
        var stack = "";
        if (promise._state === false) {
            var failure = promise._value, errorName, message;
            if (failure != null) {
                errorName = failure.name || "Error";
                message = failure.message || failure;
                stack = prettyStack(failure, 0);
            }
            else {
                errorName = failure;
                message = "";
            }
            stacks.push(errorName + (message ? ": " + message : "") + stack);
        }
        if (debug) {
            stack = prettyStack(promise._stackHolder, 2);
            if (stack && stacks.indexOf(stack) === -1)
                stacks.push(stack);
            if (promise._prev)
                getStack(promise._prev, stacks, limit);
        }
        return stacks;
    }
    function linkToPreviousPromise(promise, prev) {
        var numPrev = prev ? prev._numPrev + 1 : 0;
        if (numPrev < LONG_STACKS_CLIP_LIMIT) {
            promise._prev = prev;
            promise._numPrev = numPrev;
        }
    }
    function physicalTick() {
        beginMicroTickScope() && endMicroTickScope();
    }
    function beginMicroTickScope() {
        var wasRootExec = isOutsideMicroTick;
        isOutsideMicroTick = false;
        needsNewPhysicalTick = false;
        return wasRootExec;
    }
    function endMicroTickScope() {
        var callbacks, i, l;
        do {
            while (microtickQueue.length > 0) {
                callbacks = microtickQueue;
                microtickQueue = [];
                l = callbacks.length;
                for (i = 0; i < l; ++i) {
                    var item = callbacks[i];
                    item[0].apply(null, item[1]);
                }
            }
        } while (microtickQueue.length > 0);
        isOutsideMicroTick = true;
        needsNewPhysicalTick = true;
    }
    function finalizePhysicalTick() {
        var unhandledErrs = unhandledErrors;
        unhandledErrors = [];
        unhandledErrs.forEach(p => {
            p._PSD.onunhandled.call(null, p._value, p);
        });
        var finalizers = tickFinalizers.slice(0);
        var i = finalizers.length;
        while (i)
            finalizers[--i]();
    }
    function run_at_end_of_this_or_next_physical_tick(fn) {
        function finalizer() {
            fn();
            tickFinalizers.splice(tickFinalizers.indexOf(finalizer), 1);
        }
        tickFinalizers.push(finalizer);
        ++numScheduledCalls;
        asap(() => {
            if (--numScheduledCalls === 0)
                finalizePhysicalTick();
        }, []);
    }
    function addPossiblyUnhandledError(promise) {
        if (!unhandledErrors.some(p => p._value === promise._value))
            unhandledErrors.push(promise);
    }
    function markErrorAsHandled(promise) {
        var i = unhandledErrors.length;
        while (i)
            if (unhandledErrors[--i]._value === promise._value) {
                unhandledErrors.splice(i, 1);
                return;
            }
    }
    function PromiseReject(reason) {
        return new DexiePromise(INTERNAL, false, reason);
    }
    function wrap(fn, errorCatcher) {
        var psd = PSD;
        return function () {
            var wasRootExec = beginMicroTickScope(), outerScope = PSD;
            try {
                switchToZone(psd, true);
                return fn.apply(this, arguments);
            }
            catch (e) {
                errorCatcher && errorCatcher(e);
            }
            finally {
                switchToZone(outerScope, false);
                if (wasRootExec)
                    endMicroTickScope();
            }
        };
    }
    const task = { awaits: 0, echoes: 0, id: 0 };
    var taskCounter = 0;
    var zoneStack = [];
    var zoneEchoes = 0;
    var totalEchoes = 0;
    var zone_id_counter = 0;
    function newScope(fn, props, a1, a2) {
        var parent = PSD, psd = Object.create(parent);
        psd.parent = parent;
        psd.ref = 0;
        psd.global = false;
        psd.id = ++zone_id_counter;
        var globalEnv = globalPSD.env;
        psd.env = patchGlobalPromise ? {
            Promise: DexiePromise,
            PromiseProp: { value: DexiePromise, configurable: true, writable: true },
            all: DexiePromise.all,
            race: DexiePromise.race,
            allSettled: DexiePromise.allSettled,
            any: DexiePromise.any,
            resolve: DexiePromise.resolve,
            reject: DexiePromise.reject,
            nthen: getPatchedPromiseThen(globalEnv.nthen, psd),
            gthen: getPatchedPromiseThen(globalEnv.gthen, psd)
        } : {};
        if (props)
            extend(psd, props);
        ++parent.ref;
        psd.finalize = function () {
            --this.parent.ref || this.parent.finalize();
        };
        var rv = usePSD(psd, fn, a1, a2);
        if (psd.ref === 0)
            psd.finalize();
        return rv;
    }
    function incrementExpectedAwaits() {
        if (!task.id)
            task.id = ++taskCounter;
        ++task.awaits;
        task.echoes += ZONE_ECHO_LIMIT;
        return task.id;
    }
    function decrementExpectedAwaits() {
        if (!task.awaits)
            return false;
        if (--task.awaits === 0)
            task.id = 0;
        task.echoes = task.awaits * ZONE_ECHO_LIMIT;
        return true;
    }
    if (('' + nativePromiseThen).indexOf('[native code]') === -1) {
        incrementExpectedAwaits = decrementExpectedAwaits = nop;
    }
    function onPossibleParallellAsync(possiblePromise) {
        if (task.echoes && possiblePromise && possiblePromise.constructor === NativePromise) {
            incrementExpectedAwaits();
            return possiblePromise.then(x => {
                decrementExpectedAwaits();
                return x;
            }, e => {
                decrementExpectedAwaits();
                return rejection(e);
            });
        }
        return possiblePromise;
    }
    function zoneEnterEcho(targetZone) {
        ++totalEchoes;
        if (!task.echoes || --task.echoes === 0) {
            task.echoes = task.id = 0;
        }
        zoneStack.push(PSD);
        switchToZone(targetZone, true);
    }
    function zoneLeaveEcho() {
        var zone = zoneStack[zoneStack.length - 1];
        zoneStack.pop();
        switchToZone(zone, false);
    }
    function switchToZone(targetZone, bEnteringZone) {
        var currentZone = PSD;
        if (bEnteringZone ? task.echoes && (!zoneEchoes++ || targetZone !== PSD) : zoneEchoes && (!--zoneEchoes || targetZone !== PSD)) {
            enqueueNativeMicroTask(bEnteringZone ? zoneEnterEcho.bind(null, targetZone) : zoneLeaveEcho);
        }
        if (targetZone === PSD)
            return;
        PSD = targetZone;
        if (currentZone === globalPSD)
            globalPSD.env = snapShot();
        if (patchGlobalPromise) {
            var GlobalPromise = globalPSD.env.Promise;
            var targetEnv = targetZone.env;
            nativePromiseProto.then = targetEnv.nthen;
            GlobalPromise.prototype.then = targetEnv.gthen;
            if (currentZone.global || targetZone.global) {
                Object.defineProperty(_global, 'Promise', targetEnv.PromiseProp);
                GlobalPromise.all = targetEnv.all;
                GlobalPromise.race = targetEnv.race;
                GlobalPromise.resolve = targetEnv.resolve;
                GlobalPromise.reject = targetEnv.reject;
                if (targetEnv.allSettled)
                    GlobalPromise.allSettled = targetEnv.allSettled;
                if (targetEnv.any)
                    GlobalPromise.any = targetEnv.any;
            }
        }
    }
    function snapShot() {
        var GlobalPromise = _global.Promise;
        return patchGlobalPromise ? {
            Promise: GlobalPromise,
            PromiseProp: Object.getOwnPropertyDescriptor(_global, "Promise"),
            all: GlobalPromise.all,
            race: GlobalPromise.race,
            allSettled: GlobalPromise.allSettled,
            any: GlobalPromise.any,
            resolve: GlobalPromise.resolve,
            reject: GlobalPromise.reject,
            nthen: nativePromiseProto.then,
            gthen: GlobalPromise.prototype.then
        } : {};
    }
    function usePSD(psd, fn, a1, a2, a3) {
        var outerScope = PSD;
        try {
            switchToZone(psd, true);
            return fn(a1, a2, a3);
        }
        finally {
            switchToZone(outerScope, false);
        }
    }
    function enqueueNativeMicroTask(job) {
        nativePromiseThen.call(resolvedNativePromise, job);
    }
    function nativeAwaitCompatibleWrap(fn, zone, possibleAwait, cleanup) {
        return typeof fn !== 'function' ? fn : function () {
            var outerZone = PSD;
            if (possibleAwait)
                incrementExpectedAwaits();
            switchToZone(zone, true);
            try {
                return fn.apply(this, arguments);
            }
            finally {
                switchToZone(outerZone, false);
                if (cleanup)
                    enqueueNativeMicroTask(decrementExpectedAwaits);
            }
        };
    }
    function getPatchedPromiseThen(origThen, zone) {
        return function (onResolved, onRejected) {
            return origThen.call(this, nativeAwaitCompatibleWrap(onResolved, zone), nativeAwaitCompatibleWrap(onRejected, zone));
        };
    }
    const UNHANDLEDREJECTION = "unhandledrejection";
    function globalError(err, promise) {
        var rv;
        try {
            rv = promise.onuncatched(err);
        }
        catch (e) { }
        if (rv !== false)
            try {
                var event, eventData = { promise: promise, reason: err };
                if (_global.document && document.createEvent) {
                    event = document.createEvent('Event');
                    event.initEvent(UNHANDLEDREJECTION, true, true);
                    extend(event, eventData);
                }
                else if (_global.CustomEvent) {
                    event = new CustomEvent(UNHANDLEDREJECTION, { detail: eventData });
                    extend(event, eventData);
                }
                if (event && _global.dispatchEvent) {
                    dispatchEvent(event);
                    if (!_global.PromiseRejectionEvent && _global.onunhandledrejection)
                        try {
                            _global.onunhandledrejection(event);
                        }
                        catch (_) { }
                }
                if (debug && event && !event.defaultPrevented) {
                    console.warn(`Unhandled rejection: ${err.stack || err}`);
                }
            }
            catch (e) { }
    }
    var rejection = DexiePromise.reject;

    function tempTransaction(db, mode, storeNames, fn) {
        if (!db.idbdb || (!db._state.openComplete && (!PSD.letThrough && !db._vip))) {
            if (db._state.openComplete) {
                return rejection(new exceptions.DatabaseClosed(db._state.dbOpenError));
            }
            if (!db._state.isBeingOpened) {
                if (!db._options.autoOpen)
                    return rejection(new exceptions.DatabaseClosed());
                db.open().catch(nop);
            }
            return db._state.dbReadyPromise.then(() => tempTransaction(db, mode, storeNames, fn));
        }
        else {
            var trans = db._createTransaction(mode, storeNames, db._dbSchema);
            try {
                trans.create();
                db._state.PR1398_maxLoop = 3;
            }
            catch (ex) {
                if (ex.name === errnames.InvalidState && db.isOpen() && --db._state.PR1398_maxLoop > 0) {
                    console.warn('Dexie: Need to reopen db');
                    db._close();
                    return db.open().then(() => tempTransaction(db, mode, storeNames, fn));
                }
                return rejection(ex);
            }
            return trans._promise(mode, (resolve, reject) => {
                return newScope(() => {
                    PSD.trans = trans;
                    return fn(resolve, reject, trans);
                });
            }).then(result => {
                return trans._completion.then(() => result);
            });
        }
    }

    const DEXIE_VERSION = '4.0.1-alpha.10';
    const maxString = String.fromCharCode(65535);
    const minKey = -Infinity;
    const INVALID_KEY_ARGUMENT = "Invalid key provided. Keys must be of type string, number, Date or Array<string | number | Date>.";
    const STRING_EXPECTED = "String expected.";
    const connections = [];
    const isIEOrEdge = typeof navigator !== 'undefined' && /(MSIE|Trident|Edge)/.test(navigator.userAgent);
    const hasIEDeleteObjectStoreBug = isIEOrEdge;
    const hangsOnDeleteLargeKeyRange = isIEOrEdge;
    const dexieStackFrameFilter = frame => !/(dexie\.js|dexie\.min\.js)/.test(frame);
    const DBNAMES_DB = '__dbnames';
    const READONLY = 'readonly';
    const READWRITE = 'readwrite';

    function combine(filter1, filter2) {
        return filter1 ?
            filter2 ?
                function () { return filter1.apply(this, arguments) && filter2.apply(this, arguments); } :
                filter1 :
            filter2;
    }

    const AnyRange = {
        type: 3 ,
        lower: -Infinity,
        lowerOpen: false,
        upper: [[]],
        upperOpen: false
    };

    function workaroundForUndefinedPrimKey(keyPath) {
        return typeof keyPath === "string" && !/\./.test(keyPath)
            ? (obj) => {
                if (obj[keyPath] === undefined && (keyPath in obj)) {
                    obj = deepClone(obj);
                    delete obj[keyPath];
                }
                return obj;
            }
            : (obj) => obj;
    }

    function Entity() {
        throw exceptions.Type();
    }

    function cmp(a, b) {
        try {
            const ta = type(a);
            const tb = type(b);
            if (ta !== tb) {
                if (ta === 'Array')
                    return 1;
                if (tb === 'Array')
                    return -1;
                if (ta === 'binary')
                    return 1;
                if (tb === 'binary')
                    return -1;
                if (ta === 'string')
                    return 1;
                if (tb === 'string')
                    return -1;
                if (ta === 'Date')
                    return 1;
                if (tb !== 'Date')
                    return NaN;
                return -1;
            }
            switch (ta) {
                case 'number':
                case 'Date':
                case 'string':
                    return a > b ? 1 : a < b ? -1 : 0;
                case 'binary': {
                    return compareUint8Arrays(getUint8Array(a), getUint8Array(b));
                }
                case 'Array':
                    return compareArrays(a, b);
            }
        }
        catch (_a) { }
        return NaN;
    }
    function compareArrays(a, b) {
        const al = a.length;
        const bl = b.length;
        const l = al < bl ? al : bl;
        for (let i = 0; i < l; ++i) {
            const res = cmp(a[i], b[i]);
            if (res !== 0)
                return res;
        }
        return al === bl ? 0 : al < bl ? -1 : 1;
    }
    function compareUint8Arrays(a, b) {
        const al = a.length;
        const bl = b.length;
        const l = al < bl ? al : bl;
        for (let i = 0; i < l; ++i) {
            if (a[i] !== b[i])
                return a[i] < b[i] ? -1 : 1;
        }
        return al === bl ? 0 : al < bl ? -1 : 1;
    }
    function type(x) {
        const t = typeof x;
        if (t !== 'object')
            return t;
        if (ArrayBuffer.isView(x))
            return 'binary';
        const tsTag = toStringTag(x);
        return tsTag === 'ArrayBuffer' ? 'binary' : tsTag;
    }
    function getUint8Array(a) {
        if (a instanceof Uint8Array)
            return a;
        if (ArrayBuffer.isView(a))
            return new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
        return new Uint8Array(a);
    }

    class Table {
        _trans(mode, fn, writeLocked) {
            const trans = this._tx || PSD.trans;
            const tableName = this.name;
            function checkTableInTransaction(resolve, reject, trans) {
                if (!trans.schema[tableName])
                    throw new exceptions.NotFound("Table " + tableName + " not part of transaction");
                return fn(trans.idbtrans, trans);
            }
            const wasRootExec = beginMicroTickScope();
            try {
                return trans && trans.db === this.db ?
                    trans === PSD.trans ?
                        trans._promise(mode, checkTableInTransaction, writeLocked) :
                        newScope(() => trans._promise(mode, checkTableInTransaction, writeLocked), { trans: trans, transless: PSD.transless || PSD }) :
                    tempTransaction(this.db, mode, [this.name], checkTableInTransaction);
            }
            finally {
                if (wasRootExec)
                    endMicroTickScope();
            }
        }
        get(keyOrCrit, cb) {
            if (keyOrCrit && keyOrCrit.constructor === Object)
                return this.where(keyOrCrit).first(cb);
            return this._trans('readonly', (trans) => {
                return this.core.get({ trans, key: keyOrCrit })
                    .then(res => this.hook.reading.fire(res));
            }).then(cb);
        }
        where(indexOrCrit) {
            if (typeof indexOrCrit === 'string')
                return new this.db.WhereClause(this, indexOrCrit);
            if (isArray(indexOrCrit))
                return new this.db.WhereClause(this, `[${indexOrCrit.join('+')}]`);
            const keyPaths = keys(indexOrCrit);
            if (keyPaths.length === 1)
                return this
                    .where(keyPaths[0])
                    .equals(indexOrCrit[keyPaths[0]]);
            const compoundIndex = this.schema.indexes.concat(this.schema.primKey).filter(ix => ix.compound &&
                keyPaths.every(keyPath => ix.keyPath.indexOf(keyPath) >= 0) &&
                ix.keyPath.every(keyPath => keyPaths.indexOf(keyPath) >= 0))[0];
            if (compoundIndex && this.db._maxKey !== maxString)
                return this
                    .where(compoundIndex.name)
                    .equals(compoundIndex.keyPath.map(kp => indexOrCrit[kp]));
            if (!compoundIndex && debug)
                console.warn(`The query ${JSON.stringify(indexOrCrit)} on ${this.name} would benefit of a ` +
                    `compound index [${keyPaths.join('+')}]`);
            const { idxByName } = this.schema;
            const idb = this.db._deps.indexedDB;
            function equals(a, b) {
                return idb.cmp(a, b) === 0;
            }
            const [idx, filterFunction] = keyPaths.reduce(([prevIndex, prevFilterFn], keyPath) => {
                const index = idxByName[keyPath];
                const value = indexOrCrit[keyPath];
                return [
                    prevIndex || index,
                    prevIndex || !index ?
                        combine(prevFilterFn, index && index.multi ?
                            x => {
                                const prop = getByKeyPath(x, keyPath);
                                return isArray(prop) && prop.some(item => equals(value, item));
                            } : x => equals(value, getByKeyPath(x, keyPath)))
                        : prevFilterFn
                ];
            }, [null, null]);
            return idx ?
                this.where(idx.name).equals(indexOrCrit[idx.keyPath])
                    .filter(filterFunction) :
                compoundIndex ?
                    this.filter(filterFunction) :
                    this.where(keyPaths).equals('');
        }
        filter(filterFunction) {
            return this.toCollection().and(filterFunction);
        }
        count(thenShortcut) {
            return this.toCollection().count(thenShortcut);
        }
        offset(offset) {
            return this.toCollection().offset(offset);
        }
        limit(numRows) {
            return this.toCollection().limit(numRows);
        }
        each(callback) {
            return this.toCollection().each(callback);
        }
        toArray(thenShortcut) {
            return this.toCollection().toArray(thenShortcut);
        }
        toCollection() {
            return new this.db.Collection(new this.db.WhereClause(this));
        }
        orderBy(index) {
            return new this.db.Collection(new this.db.WhereClause(this, isArray(index) ?
                `[${index.join('+')}]` :
                index));
        }
        reverse() {
            return this.toCollection().reverse();
        }
        mapToClass(constructor) {
            const { db, name: tableName } = this;
            this.schema.mappedClass = constructor;
            if (constructor.prototype instanceof Entity) {
                constructor = class extends constructor {
                    get db() { return db; }
                    table() { return tableName; }
                };
            }
            const inheritedProps = new Set();
            for (let proto = constructor.prototype; proto; proto = getProto(proto)) {
                Object.getOwnPropertyNames(proto).forEach(propName => inheritedProps.add(propName));
            }
            const readHook = (obj) => {
                if (!obj)
                    return obj;
                const res = Object.create(constructor.prototype);
                for (let m in obj)
                    if (!inheritedProps.has(m))
                        try {
                            res[m] = obj[m];
                        }
                        catch (_) { }
                return res;
            };
            if (this.schema.readHook) {
                this.hook.reading.unsubscribe(this.schema.readHook);
            }
            this.schema.readHook = readHook;
            this.hook("reading", readHook);
            return constructor;
        }
        defineClass() {
            function Class(content) {
                extend(this, content);
            }
            return this.mapToClass(Class);
        }
        add(obj, key) {
            const { auto, keyPath } = this.schema.primKey;
            let objToAdd = obj;
            if (keyPath && auto) {
                objToAdd = workaroundForUndefinedPrimKey(keyPath)(obj);
            }
            return this._trans('readwrite', trans => {
                return this.core.mutate({ trans, type: 'add', keys: key != null ? [key] : null, values: [objToAdd] });
            }).then(res => res.numFailures ? DexiePromise.reject(res.failures[0]) : res.lastResult)
                .then(lastResult => {
                if (keyPath) {
                    try {
                        setByKeyPath(obj, keyPath, lastResult);
                    }
                    catch (_) { }
                }
                return lastResult;
            });
        }
        update(keyOrObject, modifications) {
            if (typeof keyOrObject === 'object' && !isArray(keyOrObject)) {
                const key = getByKeyPath(keyOrObject, this.schema.primKey.keyPath);
                if (key === undefined)
                    return rejection(new exceptions.InvalidArgument("Given object does not contain its primary key"));
                try {
                    if (typeof modifications !== "function") {
                        keys(modifications).forEach(keyPath => {
                            setByKeyPath(keyOrObject, keyPath, modifications[keyPath]);
                        });
                    }
                    else {
                        modifications(keyOrObject, { value: keyOrObject, primKey: key });
                    }
                }
                catch (_a) {
                }
                return this.where(":id").equals(key).modify(modifications);
            }
            else {
                return this.where(":id").equals(keyOrObject).modify(modifications);
            }
        }
        put(obj, key) {
            const { auto, keyPath } = this.schema.primKey;
            let objToAdd = obj;
            if (keyPath && auto) {
                objToAdd = workaroundForUndefinedPrimKey(keyPath)(obj);
            }
            return this._trans('readwrite', trans => this.core.mutate({ trans, type: 'put', values: [objToAdd], keys: key != null ? [key] : null }))
                .then(res => res.numFailures ? DexiePromise.reject(res.failures[0]) : res.lastResult)
                .then(lastResult => {
                if (keyPath) {
                    try {
                        setByKeyPath(obj, keyPath, lastResult);
                    }
                    catch (_) { }
                }
                return lastResult;
            });
        }
        delete(key) {
            return this._trans('readwrite', trans => this.core.mutate({ trans, type: 'delete', keys: [key] }))
                .then(res => res.numFailures ? DexiePromise.reject(res.failures[0]) : undefined);
        }
        clear() {
            return this._trans('readwrite', trans => this.core.mutate({ trans, type: 'deleteRange', range: AnyRange }))
                .then(res => res.numFailures ? DexiePromise.reject(res.failures[0]) : undefined);
        }
        bulkGet(keys) {
            return this._trans('readonly', trans => {
                return this.core.getMany({
                    keys,
                    trans
                }).then(result => result.map(res => this.hook.reading.fire(res)));
            });
        }
        bulkAdd(objects, keysOrOptions, options) {
            const keys = Array.isArray(keysOrOptions) ? keysOrOptions : undefined;
            options = options || (keys ? undefined : keysOrOptions);
            const wantResults = options ? options.allKeys : undefined;
            return this._trans('readwrite', trans => {
                const { auto, keyPath } = this.schema.primKey;
                if (keyPath && keys)
                    throw new exceptions.InvalidArgument("bulkAdd(): keys argument invalid on tables with inbound keys");
                if (keys && keys.length !== objects.length)
                    throw new exceptions.InvalidArgument("Arguments objects and keys must have the same length");
                const numObjects = objects.length;
                let objectsToAdd = keyPath && auto ?
                    objects.map(workaroundForUndefinedPrimKey(keyPath)) :
                    objects;
                return this.core.mutate({ trans, type: 'add', keys: keys, values: objectsToAdd, wantResults })
                    .then(({ numFailures, results, lastResult, failures }) => {
                    const result = wantResults ? results : lastResult;
                    if (numFailures === 0)
                        return result;
                    throw new BulkError(`${this.name}.bulkAdd(): ${numFailures} of ${numObjects} operations failed`, failures);
                });
            });
        }
        bulkPut(objects, keysOrOptions, options) {
            const keys = Array.isArray(keysOrOptions) ? keysOrOptions : undefined;
            options = options || (keys ? undefined : keysOrOptions);
            const wantResults = options ? options.allKeys : undefined;
            return this._trans('readwrite', trans => {
                const { auto, keyPath } = this.schema.primKey;
                if (keyPath && keys)
                    throw new exceptions.InvalidArgument("bulkPut(): keys argument invalid on tables with inbound keys");
                if (keys && keys.length !== objects.length)
                    throw new exceptions.InvalidArgument("Arguments objects and keys must have the same length");
                const numObjects = objects.length;
                let objectsToPut = keyPath && auto ?
                    objects.map(workaroundForUndefinedPrimKey(keyPath)) :
                    objects;
                return this.core.mutate({ trans, type: 'put', keys: keys, values: objectsToPut, wantResults })
                    .then(({ numFailures, results, lastResult, failures }) => {
                    const result = wantResults ? results : lastResult;
                    if (numFailures === 0)
                        return result;
                    throw new BulkError(`${this.name}.bulkPut(): ${numFailures} of ${numObjects} operations failed`, failures);
                });
            });
        }
        bulkUpdate(keysAndChanges) {
            const coreTable = this.core;
            const keys = keysAndChanges.map((entry) => entry.key);
            const changeSpecs = keysAndChanges.map((entry) => entry.changes);
            const offsetMap = [];
            return this._trans('readwrite', (trans) => {
                return coreTable.getMany({ trans, keys, cache: 'clone' }).then((objs) => {
                    const resultKeys = [];
                    const resultObjs = [];
                    keysAndChanges.forEach(({ key, changes }, idx) => {
                        const obj = objs[idx];
                        if (obj) {
                            for (const keyPath of Object.keys(changes)) {
                                const value = changes[keyPath];
                                if (keyPath === this.schema.primKey.keyPath) {
                                    if (cmp(value, key) !== 0) {
                                        throw new exceptions.Constraint(`Cannot update primary key in bulkUpdate()`);
                                    }
                                }
                                else {
                                    setByKeyPath(obj, keyPath, value);
                                }
                            }
                            offsetMap.push(idx);
                            resultKeys.push(key);
                            resultObjs.push(obj);
                        }
                    });
                    const numEntries = resultKeys.length;
                    return coreTable
                        .mutate({
                        trans,
                        type: 'put',
                        keys: resultKeys,
                        values: resultObjs,
                        updates: {
                            keys,
                            changeSpecs
                        }
                    })
                        .then(({ numFailures, failures }) => {
                        if (numFailures === 0)
                            return numEntries;
                        for (const offset of Object.keys(failures)) {
                            const mappedOffset = offsetMap[Number(offset)];
                            if (mappedOffset != null) {
                                const failure = failures[offset];
                                delete failures[offset];
                                failures[mappedOffset] = failure;
                            }
                        }
                        throw new BulkError(`${this.name}.bulkUpdate(): ${numFailures} of ${numEntries} operations failed`, failures);
                    });
                });
            });
        }
        bulkDelete(keys) {
            const numKeys = keys.length;
            return this._trans('readwrite', trans => {
                return this.core.mutate({ trans, type: 'delete', keys: keys });
            }).then(({ numFailures, lastResult, failures }) => {
                if (numFailures === 0)
                    return lastResult;
                throw new BulkError(`${this.name}.bulkDelete(): ${numFailures} of ${numKeys} operations failed`, failures);
            });
        }
    }

    function Events(ctx) {
        var evs = {};
        var rv = function (eventName, subscriber) {
            if (subscriber) {
                var i = arguments.length, args = new Array(i - 1);
                while (--i)
                    args[i - 1] = arguments[i];
                evs[eventName].subscribe.apply(null, args);
                return ctx;
            }
            else if (typeof (eventName) === 'string') {
                return evs[eventName];
            }
        };
        rv.addEventType = add;
        for (var i = 1, l = arguments.length; i < l; ++i) {
            add(arguments[i]);
        }
        return rv;
        function add(eventName, chainFunction, defaultFunction) {
            if (typeof eventName === 'object')
                return addConfiguredEvents(eventName);
            if (!chainFunction)
                chainFunction = reverseStoppableEventChain;
            if (!defaultFunction)
                defaultFunction = nop;
            var context = {
                subscribers: [],
                fire: defaultFunction,
                subscribe: function (cb) {
                    if (context.subscribers.indexOf(cb) === -1) {
                        context.subscribers.push(cb);
                        context.fire = chainFunction(context.fire, cb);
                    }
                },
                unsubscribe: function (cb) {
                    context.subscribers = context.subscribers.filter(function (fn) { return fn !== cb; });
                    context.fire = context.subscribers.reduce(chainFunction, defaultFunction);
                }
            };
            evs[eventName] = rv[eventName] = context;
            return context;
        }
        function addConfiguredEvents(cfg) {
            keys(cfg).forEach(function (eventName) {
                var args = cfg[eventName];
                if (isArray(args)) {
                    add(eventName, cfg[eventName][0], cfg[eventName][1]);
                }
                else if (args === 'asap') {
                    var context = add(eventName, mirror, function fire() {
                        var i = arguments.length, args = new Array(i);
                        while (i--)
                            args[i] = arguments[i];
                        context.subscribers.forEach(function (fn) {
                            asap$1(function fireEvent() {
                                fn.apply(null, args);
                            });
                        });
                    });
                }
                else
                    throw new exceptions.InvalidArgument("Invalid event config");
            });
        }
    }

    function makeClassConstructor(prototype, constructor) {
        derive(constructor).from({ prototype });
        return constructor;
    }

    function createTableConstructor(db) {
        return makeClassConstructor(Table.prototype, function Table(name, tableSchema, trans) {
            this.db = db;
            this._tx = trans;
            this.name = name;
            this.schema = tableSchema;
            this.hook = db._allTables[name] ? db._allTables[name].hook : Events(null, {
                "creating": [hookCreatingChain, nop],
                "reading": [pureFunctionChain, mirror],
                "updating": [hookUpdatingChain, nop],
                "deleting": [hookDeletingChain, nop]
            });
        });
    }

    function isPlainKeyRange(ctx, ignoreLimitFilter) {
        return !(ctx.filter || ctx.algorithm || ctx.or) &&
            (ignoreLimitFilter ? ctx.justLimit : !ctx.replayFilter);
    }
    function addFilter(ctx, fn) {
        ctx.filter = combine(ctx.filter, fn);
    }
    function addReplayFilter(ctx, factory, isLimitFilter) {
        var curr = ctx.replayFilter;
        ctx.replayFilter = curr ? () => combine(curr(), factory()) : factory;
        ctx.justLimit = isLimitFilter && !curr;
    }
    function addMatchFilter(ctx, fn) {
        ctx.isMatch = combine(ctx.isMatch, fn);
    }
    function getIndexOrStore(ctx, coreSchema) {
        if (ctx.isPrimKey)
            return coreSchema.primaryKey;
        const index = coreSchema.getIndexByKeyPath(ctx.index);
        if (!index)
            throw new exceptions.Schema("KeyPath " + ctx.index + " on object store " + coreSchema.name + " is not indexed");
        return index;
    }
    function openCursor(ctx, coreTable, trans) {
        const index = getIndexOrStore(ctx, coreTable.schema);
        return coreTable.openCursor({
            trans,
            values: !ctx.keysOnly,
            reverse: ctx.dir === 'prev',
            unique: !!ctx.unique,
            query: {
                index,
                range: ctx.range
            }
        });
    }
    function iter(ctx, fn, coreTrans, coreTable) {
        const filter = ctx.replayFilter ? combine(ctx.filter, ctx.replayFilter()) : ctx.filter;
        if (!ctx.or) {
            return iterate(openCursor(ctx, coreTable, coreTrans), combine(ctx.algorithm, filter), fn, !ctx.keysOnly && ctx.valueMapper);
        }
        else {
            const set = {};
            const union = (item, cursor, advance) => {
                if (!filter || filter(cursor, advance, result => cursor.stop(result), err => cursor.fail(err))) {
                    var primaryKey = cursor.primaryKey;
                    var key = '' + primaryKey;
                    if (key === '[object ArrayBuffer]')
                        key = '' + new Uint8Array(primaryKey);
                    if (!hasOwn(set, key)) {
                        set[key] = true;
                        fn(item, cursor, advance);
                    }
                }
            };
            return Promise.all([
                ctx.or._iterate(union, coreTrans),
                iterate(openCursor(ctx, coreTable, coreTrans), ctx.algorithm, union, !ctx.keysOnly && ctx.valueMapper)
            ]);
        }
    }
    function iterate(cursorPromise, filter, fn, valueMapper) {
        var mappedFn = valueMapper ? (x, c, a) => fn(valueMapper(x), c, a) : fn;
        var wrappedFn = wrap(mappedFn);
        return cursorPromise.then(cursor => {
            if (cursor) {
                return cursor.start(() => {
                    var c = () => cursor.continue();
                    if (!filter || filter(cursor, advancer => c = advancer, val => { cursor.stop(val); c = nop; }, e => { cursor.fail(e); c = nop; }))
                        wrappedFn(cursor.value, cursor, advancer => c = advancer);
                    c();
                });
            }
        });
    }

    class Collection {
        _read(fn, cb) {
            var ctx = this._ctx;
            return ctx.error ?
                ctx.table._trans(null, rejection.bind(null, ctx.error)) :
                ctx.table._trans('readonly', fn).then(cb);
        }
        _write(fn) {
            var ctx = this._ctx;
            return ctx.error ?
                ctx.table._trans(null, rejection.bind(null, ctx.error)) :
                ctx.table._trans('readwrite', fn, "locked");
        }
        _addAlgorithm(fn) {
            var ctx = this._ctx;
            ctx.algorithm = combine(ctx.algorithm, fn);
        }
        _iterate(fn, coreTrans) {
            return iter(this._ctx, fn, coreTrans, this._ctx.table.core);
        }
        clone(props) {
            var rv = Object.create(this.constructor.prototype), ctx = Object.create(this._ctx);
            if (props)
                extend(ctx, props);
            rv._ctx = ctx;
            return rv;
        }
        raw() {
            this._ctx.valueMapper = null;
            return this;
        }
        each(fn) {
            var ctx = this._ctx;
            return this._read(trans => iter(ctx, fn, trans, ctx.table.core));
        }
        count(cb) {
            return this._read(trans => {
                const ctx = this._ctx;
                const coreTable = ctx.table.core;
                if (isPlainKeyRange(ctx, true)) {
                    return coreTable.count({
                        trans,
                        query: {
                            index: getIndexOrStore(ctx, coreTable.schema),
                            range: ctx.range
                        }
                    }).then(count => Math.min(count, ctx.limit));
                }
                else {
                    var count = 0;
                    return iter(ctx, () => { ++count; return false; }, trans, coreTable)
                        .then(() => count);
                }
            }).then(cb);
        }
        sortBy(keyPath, cb) {
            const parts = keyPath.split('.').reverse(), lastPart = parts[0], lastIndex = parts.length - 1;
            function getval(obj, i) {
                if (i)
                    return getval(obj[parts[i]], i - 1);
                return obj[lastPart];
            }
            var order = this._ctx.dir === "next" ? 1 : -1;
            function sorter(a, b) {
                var aVal = getval(a, lastIndex), bVal = getval(b, lastIndex);
                return aVal < bVal ? -order : aVal > bVal ? order : 0;
            }
            return this.toArray(function (a) {
                return a.sort(sorter);
            }).then(cb);
        }
        toArray(cb) {
            return this._read(trans => {
                var ctx = this._ctx;
                if (ctx.dir === 'next' && isPlainKeyRange(ctx, true) && ctx.limit > 0) {
                    const { valueMapper } = ctx;
                    const index = getIndexOrStore(ctx, ctx.table.core.schema);
                    return ctx.table.core.query({
                        trans,
                        limit: ctx.limit,
                        values: true,
                        query: {
                            index,
                            range: ctx.range
                        }
                    }).then(({ result }) => valueMapper ? result.map(valueMapper) : result);
                }
                else {
                    const a = [];
                    return iter(ctx, item => a.push(item), trans, ctx.table.core).then(() => a);
                }
            }, cb);
        }
        offset(offset) {
            var ctx = this._ctx;
            if (offset <= 0)
                return this;
            ctx.offset += offset;
            if (isPlainKeyRange(ctx)) {
                addReplayFilter(ctx, () => {
                    var offsetLeft = offset;
                    return (cursor, advance) => {
                        if (offsetLeft === 0)
                            return true;
                        if (offsetLeft === 1) {
                            --offsetLeft;
                            return false;
                        }
                        advance(() => {
                            cursor.advance(offsetLeft);
                            offsetLeft = 0;
                        });
                        return false;
                    };
                });
            }
            else {
                addReplayFilter(ctx, () => {
                    var offsetLeft = offset;
                    return () => (--offsetLeft < 0);
                });
            }
            return this;
        }
        limit(numRows) {
            this._ctx.limit = Math.min(this._ctx.limit, numRows);
            addReplayFilter(this._ctx, () => {
                var rowsLeft = numRows;
                return function (cursor, advance, resolve) {
                    if (--rowsLeft <= 0)
                        advance(resolve);
                    return rowsLeft >= 0;
                };
            }, true);
            return this;
        }
        until(filterFunction, bIncludeStopEntry) {
            addFilter(this._ctx, function (cursor, advance, resolve) {
                if (filterFunction(cursor.value)) {
                    advance(resolve);
                    return bIncludeStopEntry;
                }
                else {
                    return true;
                }
            });
            return this;
        }
        first(cb) {
            return this.limit(1).toArray(function (a) { return a[0]; }).then(cb);
        }
        last(cb) {
            return this.reverse().first(cb);
        }
        filter(filterFunction) {
            addFilter(this._ctx, function (cursor) {
                return filterFunction(cursor.value);
            });
            addMatchFilter(this._ctx, filterFunction);
            return this;
        }
        and(filter) {
            return this.filter(filter);
        }
        or(indexName) {
            return new this.db.WhereClause(this._ctx.table, indexName, this);
        }
        reverse() {
            this._ctx.dir = (this._ctx.dir === "prev" ? "next" : "prev");
            if (this._ondirectionchange)
                this._ondirectionchange(this._ctx.dir);
            return this;
        }
        desc() {
            return this.reverse();
        }
        eachKey(cb) {
            var ctx = this._ctx;
            ctx.keysOnly = !ctx.isMatch;
            return this.each(function (val, cursor) { cb(cursor.key, cursor); });
        }
        eachUniqueKey(cb) {
            this._ctx.unique = "unique";
            return this.eachKey(cb);
        }
        eachPrimaryKey(cb) {
            var ctx = this._ctx;
            ctx.keysOnly = !ctx.isMatch;
            return this.each(function (val, cursor) { cb(cursor.primaryKey, cursor); });
        }
        keys(cb) {
            var ctx = this._ctx;
            ctx.keysOnly = !ctx.isMatch;
            var a = [];
            return this.each(function (item, cursor) {
                a.push(cursor.key);
            }).then(function () {
                return a;
            }).then(cb);
        }
        primaryKeys(cb) {
            var ctx = this._ctx;
            if (ctx.dir === 'next' && isPlainKeyRange(ctx, true) && ctx.limit > 0) {
                return this._read(trans => {
                    var index = getIndexOrStore(ctx, ctx.table.core.schema);
                    return ctx.table.core.query({
                        trans,
                        values: false,
                        limit: ctx.limit,
                        query: {
                            index,
                            range: ctx.range
                        }
                    });
                }).then(({ result }) => result).then(cb);
            }
            ctx.keysOnly = !ctx.isMatch;
            var a = [];
            return this.each(function (item, cursor) {
                a.push(cursor.primaryKey);
            }).then(function () {
                return a;
            }).then(cb);
        }
        uniqueKeys(cb) {
            this._ctx.unique = "unique";
            return this.keys(cb);
        }
        firstKey(cb) {
            return this.limit(1).keys(function (a) { return a[0]; }).then(cb);
        }
        lastKey(cb) {
            return this.reverse().firstKey(cb);
        }
        distinct() {
            var ctx = this._ctx, idx = ctx.index && ctx.table.schema.idxByName[ctx.index];
            if (!idx || !idx.multi)
                return this;
            var set = {};
            addFilter(this._ctx, function (cursor) {
                var strKey = cursor.primaryKey.toString();
                var found = hasOwn(set, strKey);
                set[strKey] = true;
                return !found;
            });
            return this;
        }
        modify(changes) {
            var ctx = this._ctx;
            return this._write(trans => {
                var modifyer;
                if (typeof changes === 'function') {
                    modifyer = changes;
                }
                else {
                    var keyPaths = keys(changes);
                    var numKeys = keyPaths.length;
                    modifyer = function (item) {
                        var anythingModified = false;
                        for (var i = 0; i < numKeys; ++i) {
                            var keyPath = keyPaths[i], val = changes[keyPath];
                            if (getByKeyPath(item, keyPath) !== val) {
                                setByKeyPath(item, keyPath, val);
                                anythingModified = true;
                            }
                        }
                        return anythingModified;
                    };
                }
                const coreTable = ctx.table.core;
                const { outbound, extractKey } = coreTable.schema.primaryKey;
                const limit = this.db._options.modifyChunkSize || 200;
                const totalFailures = [];
                let successCount = 0;
                const failedKeys = [];
                const applyMutateResult = (expectedCount, res) => {
                    const { failures, numFailures } = res;
                    successCount += expectedCount - numFailures;
                    for (let pos of keys(failures)) {
                        totalFailures.push(failures[pos]);
                    }
                };
                return this.clone().primaryKeys().then(keys => {
                    const nextChunk = (offset) => {
                        const count = Math.min(limit, keys.length - offset);
                        return coreTable.getMany({
                            trans,
                            keys: keys.slice(offset, offset + count),
                            cache: "immutable"
                        }).then(values => {
                            const addValues = [];
                            const putValues = [];
                            const putKeys = outbound ? [] : null;
                            const deleteKeys = [];
                            for (let i = 0; i < count; ++i) {
                                const origValue = values[i];
                                const ctx = {
                                    value: deepClone(origValue),
                                    primKey: keys[offset + i]
                                };
                                if (modifyer.call(ctx, ctx.value, ctx) !== false) {
                                    if (ctx.value == null) {
                                        deleteKeys.push(keys[offset + i]);
                                    }
                                    else if (!outbound && cmp(extractKey(origValue), extractKey(ctx.value)) !== 0) {
                                        deleteKeys.push(keys[offset + i]);
                                        addValues.push(ctx.value);
                                    }
                                    else {
                                        putValues.push(ctx.value);
                                        if (outbound)
                                            putKeys.push(keys[offset + i]);
                                    }
                                }
                            }
                            const criteria = isPlainKeyRange(ctx) &&
                                ctx.limit === Infinity &&
                                (typeof changes !== 'function' || changes === deleteCallback) && {
                                index: ctx.index,
                                range: ctx.range
                            };
                            return Promise.resolve(addValues.length > 0 &&
                                coreTable.mutate({ trans, type: 'add', values: addValues })
                                    .then(res => {
                                    for (let pos in res.failures) {
                                        deleteKeys.splice(parseInt(pos), 1);
                                    }
                                    applyMutateResult(addValues.length, res);
                                })).then(() => (putValues.length > 0 || (criteria && typeof changes === 'object')) &&
                                coreTable.mutate({
                                    trans,
                                    type: 'put',
                                    keys: putKeys,
                                    values: putValues,
                                    criteria,
                                    changeSpec: typeof changes !== 'function'
                                        && changes
                                }).then(res => applyMutateResult(putValues.length, res))).then(() => (deleteKeys.length > 0 || (criteria && changes === deleteCallback)) &&
                                coreTable.mutate({
                                    trans,
                                    type: 'delete',
                                    keys: deleteKeys,
                                    criteria
                                }).then(res => applyMutateResult(deleteKeys.length, res))).then(() => {
                                return keys.length > offset + count && nextChunk(offset + limit);
                            });
                        });
                    };
                    return nextChunk(0).then(() => {
                        if (totalFailures.length > 0)
                            throw new ModifyError("Error modifying one or more objects", totalFailures, successCount, failedKeys);
                        return keys.length;
                    });
                });
            });
        }
        delete() {
            var ctx = this._ctx, range = ctx.range;
            if (isPlainKeyRange(ctx) &&
                ((ctx.isPrimKey && !hangsOnDeleteLargeKeyRange) || range.type === 3 ))
             {
                return this._write(trans => {
                    const { primaryKey } = ctx.table.core.schema;
                    const coreRange = range;
                    return ctx.table.core.count({ trans, query: { index: primaryKey, range: coreRange } }).then(count => {
                        return ctx.table.core.mutate({ trans, type: 'deleteRange', range: coreRange })
                            .then(({ failures, lastResult, results, numFailures }) => {
                            if (numFailures)
                                throw new ModifyError("Could not delete some values", Object.keys(failures).map(pos => failures[pos]), count - numFailures);
                            return count - numFailures;
                        });
                    });
                });
            }
            return this.modify(deleteCallback);
        }
    }
    const deleteCallback = (value, ctx) => ctx.value = null;

    function createCollectionConstructor(db) {
        return makeClassConstructor(Collection.prototype, function Collection(whereClause, keyRangeGenerator) {
            this.db = db;
            let keyRange = AnyRange, error = null;
            if (keyRangeGenerator)
                try {
                    keyRange = keyRangeGenerator();
                }
                catch (ex) {
                    error = ex;
                }
            const whereCtx = whereClause._ctx;
            const table = whereCtx.table;
            const readingHook = table.hook.reading.fire;
            this._ctx = {
                table: table,
                index: whereCtx.index,
                isPrimKey: (!whereCtx.index || (table.schema.primKey.keyPath && whereCtx.index === table.schema.primKey.name)),
                range: keyRange,
                keysOnly: false,
                dir: "next",
                unique: "",
                algorithm: null,
                filter: null,
                replayFilter: null,
                justLimit: true,
                isMatch: null,
                offset: 0,
                limit: Infinity,
                error: error,
                or: whereCtx.or,
                valueMapper: readingHook !== mirror ? readingHook : null
            };
        });
    }

    function simpleCompare(a, b) {
        return a < b ? -1 : a === b ? 0 : 1;
    }
    function simpleCompareReverse(a, b) {
        return a > b ? -1 : a === b ? 0 : 1;
    }

    function fail(collectionOrWhereClause, err, T) {
        var collection = collectionOrWhereClause instanceof WhereClause ?
            new collectionOrWhereClause.Collection(collectionOrWhereClause) :
            collectionOrWhereClause;
        collection._ctx.error = T ? new T(err) : new TypeError(err);
        return collection;
    }
    function emptyCollection(whereClause) {
        return new whereClause.Collection(whereClause, () => rangeEqual("")).limit(0);
    }
    function upperFactory(dir) {
        return dir === "next" ?
            (s) => s.toUpperCase() :
            (s) => s.toLowerCase();
    }
    function lowerFactory(dir) {
        return dir === "next" ?
            (s) => s.toLowerCase() :
            (s) => s.toUpperCase();
    }
    function nextCasing(key, lowerKey, upperNeedle, lowerNeedle, cmp, dir) {
        var length = Math.min(key.length, lowerNeedle.length);
        var llp = -1;
        for (var i = 0; i < length; ++i) {
            var lwrKeyChar = lowerKey[i];
            if (lwrKeyChar !== lowerNeedle[i]) {
                if (cmp(key[i], upperNeedle[i]) < 0)
                    return key.substr(0, i) + upperNeedle[i] + upperNeedle.substr(i + 1);
                if (cmp(key[i], lowerNeedle[i]) < 0)
                    return key.substr(0, i) + lowerNeedle[i] + upperNeedle.substr(i + 1);
                if (llp >= 0)
                    return key.substr(0, llp) + lowerKey[llp] + upperNeedle.substr(llp + 1);
                return null;
            }
            if (cmp(key[i], lwrKeyChar) < 0)
                llp = i;
        }
        if (length < lowerNeedle.length && dir === "next")
            return key + upperNeedle.substr(key.length);
        if (length < key.length && dir === "prev")
            return key.substr(0, upperNeedle.length);
        return (llp < 0 ? null : key.substr(0, llp) + lowerNeedle[llp] + upperNeedle.substr(llp + 1));
    }
    function addIgnoreCaseAlgorithm(whereClause, match, needles, suffix) {
        var upper, lower, compare, upperNeedles, lowerNeedles, direction, nextKeySuffix, needlesLen = needles.length;
        if (!needles.every(s => typeof s === 'string')) {
            return fail(whereClause, STRING_EXPECTED);
        }
        function initDirection(dir) {
            upper = upperFactory(dir);
            lower = lowerFactory(dir);
            compare = (dir === "next" ? simpleCompare : simpleCompareReverse);
            var needleBounds = needles.map(function (needle) {
                return { lower: lower(needle), upper: upper(needle) };
            }).sort(function (a, b) {
                return compare(a.lower, b.lower);
            });
            upperNeedles = needleBounds.map(function (nb) { return nb.upper; });
            lowerNeedles = needleBounds.map(function (nb) { return nb.lower; });
            direction = dir;
            nextKeySuffix = (dir === "next" ? "" : suffix);
        }
        initDirection("next");
        var c = new whereClause.Collection(whereClause, () => createRange(upperNeedles[0], lowerNeedles[needlesLen - 1] + suffix));
        c._ondirectionchange = function (direction) {
            initDirection(direction);
        };
        var firstPossibleNeedle = 0;
        c._addAlgorithm(function (cursor, advance, resolve) {
            var key = cursor.key;
            if (typeof key !== 'string')
                return false;
            var lowerKey = lower(key);
            if (match(lowerKey, lowerNeedles, firstPossibleNeedle)) {
                return true;
            }
            else {
                var lowestPossibleCasing = null;
                for (var i = firstPossibleNeedle; i < needlesLen; ++i) {
                    var casing = nextCasing(key, lowerKey, upperNeedles[i], lowerNeedles[i], compare, direction);
                    if (casing === null && lowestPossibleCasing === null)
                        firstPossibleNeedle = i + 1;
                    else if (lowestPossibleCasing === null || compare(lowestPossibleCasing, casing) > 0) {
                        lowestPossibleCasing = casing;
                    }
                }
                if (lowestPossibleCasing !== null) {
                    advance(function () { cursor.continue(lowestPossibleCasing + nextKeySuffix); });
                }
                else {
                    advance(resolve);
                }
                return false;
            }
        });
        return c;
    }
    function createRange(lower, upper, lowerOpen, upperOpen) {
        return {
            type: 2 ,
            lower,
            upper,
            lowerOpen,
            upperOpen
        };
    }
    function rangeEqual(value) {
        return {
            type: 1 ,
            lower: value,
            upper: value
        };
    }

    class WhereClause {
        get Collection() {
            return this._ctx.table.db.Collection;
        }
        between(lower, upper, includeLower, includeUpper) {
            includeLower = includeLower !== false;
            includeUpper = includeUpper === true;
            try {
                if ((this._cmp(lower, upper) > 0) ||
                    (this._cmp(lower, upper) === 0 && (includeLower || includeUpper) && !(includeLower && includeUpper)))
                    return emptyCollection(this);
                return new this.Collection(this, () => createRange(lower, upper, !includeLower, !includeUpper));
            }
            catch (e) {
                return fail(this, INVALID_KEY_ARGUMENT);
            }
        }
        equals(value) {
            if (value == null)
                return fail(this, INVALID_KEY_ARGUMENT);
            return new this.Collection(this, () => rangeEqual(value));
        }
        above(value) {
            if (value == null)
                return fail(this, INVALID_KEY_ARGUMENT);
            return new this.Collection(this, () => createRange(value, undefined, true));
        }
        aboveOrEqual(value) {
            if (value == null)
                return fail(this, INVALID_KEY_ARGUMENT);
            return new this.Collection(this, () => createRange(value, undefined, false));
        }
        below(value) {
            if (value == null)
                return fail(this, INVALID_KEY_ARGUMENT);
            return new this.Collection(this, () => createRange(undefined, value, false, true));
        }
        belowOrEqual(value) {
            if (value == null)
                return fail(this, INVALID_KEY_ARGUMENT);
            return new this.Collection(this, () => createRange(undefined, value));
        }
        startsWith(str) {
            if (typeof str !== 'string')
                return fail(this, STRING_EXPECTED);
            return this.between(str, str + maxString, true, true);
        }
        startsWithIgnoreCase(str) {
            if (str === "")
                return this.startsWith(str);
            return addIgnoreCaseAlgorithm(this, (x, a) => x.indexOf(a[0]) === 0, [str], maxString);
        }
        equalsIgnoreCase(str) {
            return addIgnoreCaseAlgorithm(this, (x, a) => x === a[0], [str], "");
        }
        anyOfIgnoreCase() {
            var set = getArrayOf.apply(NO_CHAR_ARRAY, arguments);
            if (set.length === 0)
                return emptyCollection(this);
            return addIgnoreCaseAlgorithm(this, (x, a) => a.indexOf(x) !== -1, set, "");
        }
        startsWithAnyOfIgnoreCase() {
            var set = getArrayOf.apply(NO_CHAR_ARRAY, arguments);
            if (set.length === 0)
                return emptyCollection(this);
            return addIgnoreCaseAlgorithm(this, (x, a) => a.some(n => x.indexOf(n) === 0), set, maxString);
        }
        anyOf() {
            const set = getArrayOf.apply(NO_CHAR_ARRAY, arguments);
            let compare = this._cmp;
            try {
                set.sort(compare);
            }
            catch (e) {
                return fail(this, INVALID_KEY_ARGUMENT);
            }
            if (set.length === 0)
                return emptyCollection(this);
            const c = new this.Collection(this, () => createRange(set[0], set[set.length - 1]));
            c._ondirectionchange = direction => {
                compare = (direction === "next" ?
                    this._ascending :
                    this._descending);
                set.sort(compare);
            };
            let i = 0;
            c._addAlgorithm((cursor, advance, resolve) => {
                const key = cursor.key;
                while (compare(key, set[i]) > 0) {
                    ++i;
                    if (i === set.length) {
                        advance(resolve);
                        return false;
                    }
                }
                if (compare(key, set[i]) === 0) {
                    return true;
                }
                else {
                    advance(() => { cursor.continue(set[i]); });
                    return false;
                }
            });
            return c;
        }
        notEqual(value) {
            return this.inAnyRange([[minKey, value], [value, this.db._maxKey]], { includeLowers: false, includeUppers: false });
        }
        noneOf() {
            const set = getArrayOf.apply(NO_CHAR_ARRAY, arguments);
            if (set.length === 0)
                return new this.Collection(this);
            try {
                set.sort(this._ascending);
            }
            catch (e) {
                return fail(this, INVALID_KEY_ARGUMENT);
            }
            const ranges = set.reduce((res, val) => res ?
                res.concat([[res[res.length - 1][1], val]]) :
                [[minKey, val]], null);
            ranges.push([set[set.length - 1], this.db._maxKey]);
            return this.inAnyRange(ranges, { includeLowers: false, includeUppers: false });
        }
        inAnyRange(ranges, options) {
            const cmp = this._cmp, ascending = this._ascending, descending = this._descending, min = this._min, max = this._max;
            if (ranges.length === 0)
                return emptyCollection(this);
            if (!ranges.every(range => range[0] !== undefined &&
                range[1] !== undefined &&
                ascending(range[0], range[1]) <= 0)) {
                return fail(this, "First argument to inAnyRange() must be an Array of two-value Arrays [lower,upper] where upper must not be lower than lower", exceptions.InvalidArgument);
            }
            const includeLowers = !options || options.includeLowers !== false;
            const includeUppers = options && options.includeUppers === true;
            function addRange(ranges, newRange) {
                let i = 0, l = ranges.length;
                for (; i < l; ++i) {
                    const range = ranges[i];
                    if (cmp(newRange[0], range[1]) < 0 && cmp(newRange[1], range[0]) > 0) {
                        range[0] = min(range[0], newRange[0]);
                        range[1] = max(range[1], newRange[1]);
                        break;
                    }
                }
                if (i === l)
                    ranges.push(newRange);
                return ranges;
            }
            let sortDirection = ascending;
            function rangeSorter(a, b) { return sortDirection(a[0], b[0]); }
            let set;
            try {
                set = ranges.reduce(addRange, []);
                set.sort(rangeSorter);
            }
            catch (ex) {
                return fail(this, INVALID_KEY_ARGUMENT);
            }
            let rangePos = 0;
            const keyIsBeyondCurrentEntry = includeUppers ?
                key => ascending(key, set[rangePos][1]) > 0 :
                key => ascending(key, set[rangePos][1]) >= 0;
            const keyIsBeforeCurrentEntry = includeLowers ?
                key => descending(key, set[rangePos][0]) > 0 :
                key => descending(key, set[rangePos][0]) >= 0;
            function keyWithinCurrentRange(key) {
                return !keyIsBeyondCurrentEntry(key) && !keyIsBeforeCurrentEntry(key);
            }
            let checkKey = keyIsBeyondCurrentEntry;
            const c = new this.Collection(this, () => createRange(set[0][0], set[set.length - 1][1], !includeLowers, !includeUppers));
            c._ondirectionchange = direction => {
                if (direction === "next") {
                    checkKey = keyIsBeyondCurrentEntry;
                    sortDirection = ascending;
                }
                else {
                    checkKey = keyIsBeforeCurrentEntry;
                    sortDirection = descending;
                }
                set.sort(rangeSorter);
            };
            c._addAlgorithm((cursor, advance, resolve) => {
                var key = cursor.key;
                while (checkKey(key)) {
                    ++rangePos;
                    if (rangePos === set.length) {
                        advance(resolve);
                        return false;
                    }
                }
                if (keyWithinCurrentRange(key)) {
                    return true;
                }
                else if (this._cmp(key, set[rangePos][1]) === 0 || this._cmp(key, set[rangePos][0]) === 0) {
                    return false;
                }
                else {
                    advance(() => {
                        if (sortDirection === ascending)
                            cursor.continue(set[rangePos][0]);
                        else
                            cursor.continue(set[rangePos][1]);
                    });
                    return false;
                }
            });
            return c;
        }
        startsWithAnyOf() {
            const set = getArrayOf.apply(NO_CHAR_ARRAY, arguments);
            if (!set.every(s => typeof s === 'string')) {
                return fail(this, "startsWithAnyOf() only works with strings");
            }
            if (set.length === 0)
                return emptyCollection(this);
            return this.inAnyRange(set.map((str) => [str, str + maxString]));
        }
    }

    function createWhereClauseConstructor(db) {
        return makeClassConstructor(WhereClause.prototype, function WhereClause(table, index, orCollection) {
            this.db = db;
            this._ctx = {
                table: table,
                index: index === ":id" ? null : index,
                or: orCollection
            };
            this._cmp = this._ascending = cmp;
            this._descending = (a, b) => cmp(b, a);
            this._max = (a, b) => cmp(a, b) > 0 ? a : b;
            this._min = (a, b) => cmp(a, b) < 0 ? a : b;
            this._IDBKeyRange = db._deps.IDBKeyRange;
            if (!this._IDBKeyRange)
                throw new exceptions.MissingAPI();
        });
    }

    function eventRejectHandler(reject) {
        return wrap(function (event) {
            preventDefault(event);
            reject(event.target.error);
            return false;
        });
    }
    function preventDefault(event) {
        if (event.stopPropagation)
            event.stopPropagation();
        if (event.preventDefault)
            event.preventDefault();
    }

    const DEXIE_STORAGE_MUTATED_EVENT_NAME = 'storagemutated';
    const STORAGE_MUTATED_DOM_EVENT_NAME = 'x-storagemutated-1';
    const globalEvents = Events(null, DEXIE_STORAGE_MUTATED_EVENT_NAME);

    class Transaction {
        _lock() {
            assert(!PSD.global);
            ++this._reculock;
            if (this._reculock === 1 && !PSD.global)
                PSD.lockOwnerFor = this;
            return this;
        }
        _unlock() {
            assert(!PSD.global);
            if (--this._reculock === 0) {
                if (!PSD.global)
                    PSD.lockOwnerFor = null;
                while (this._blockedFuncs.length > 0 && !this._locked()) {
                    var fnAndPSD = this._blockedFuncs.shift();
                    try {
                        usePSD(fnAndPSD[1], fnAndPSD[0]);
                    }
                    catch (e) { }
                }
            }
            return this;
        }
        _locked() {
            return this._reculock && PSD.lockOwnerFor !== this;
        }
        create(idbtrans) {
            if (!this.mode)
                return this;
            const idbdb = this.db.idbdb;
            const dbOpenError = this.db._state.dbOpenError;
            assert(!this.idbtrans);
            if (!idbtrans && !idbdb) {
                switch (dbOpenError && dbOpenError.name) {
                    case "DatabaseClosedError":
                        throw new exceptions.DatabaseClosed(dbOpenError);
                    case "MissingAPIError":
                        throw new exceptions.MissingAPI(dbOpenError.message, dbOpenError);
                    default:
                        throw new exceptions.OpenFailed(dbOpenError);
                }
            }
            if (!this.active)
                throw new exceptions.TransactionInactive();
            assert(this._completion._state === null);
            idbtrans = this.idbtrans = idbtrans ||
                (this.db.core
                    ? this.db.core.transaction(this.storeNames, this.mode, { durability: this.chromeTransactionDurability })
                    : idbdb.transaction(this.storeNames, this.mode, { durability: this.chromeTransactionDurability }));
            idbtrans.onerror = wrap(ev => {
                preventDefault(ev);
                this._reject(idbtrans.error);
            });
            idbtrans.onabort = wrap(ev => {
                preventDefault(ev);
                this.active && this._reject(new exceptions.Abort(idbtrans.error));
                this.active = false;
                this.on("abort").fire(ev);
            });
            idbtrans.oncomplete = wrap(() => {
                this.active = false;
                this._resolve();
                if ('mutatedParts' in idbtrans) {
                    globalEvents.storagemutated.fire(idbtrans["mutatedParts"]);
                }
            });
            return this;
        }
        _promise(mode, fn, bWriteLock) {
            if (mode === 'readwrite' && this.mode !== 'readwrite')
                return rejection(new exceptions.ReadOnly("Transaction is readonly"));
            if (!this.active)
                return rejection(new exceptions.TransactionInactive());
            if (this._locked()) {
                return new DexiePromise((resolve, reject) => {
                    this._blockedFuncs.push([() => {
                            this._promise(mode, fn, bWriteLock).then(resolve, reject);
                        }, PSD]);
                });
            }
            else if (bWriteLock) {
                return newScope(() => {
                    var p = new DexiePromise((resolve, reject) => {
                        this._lock();
                        const rv = fn(resolve, reject, this);
                        if (rv && rv.then)
                            rv.then(resolve, reject);
                    });
                    p.finally(() => this._unlock());
                    p._lib = true;
                    return p;
                });
            }
            else {
                var p = new DexiePromise((resolve, reject) => {
                    var rv = fn(resolve, reject, this);
                    if (rv && rv.then)
                        rv.then(resolve, reject);
                });
                p._lib = true;
                return p;
            }
        }
        _root() {
            return this.parent ? this.parent._root() : this;
        }
        waitFor(promiseLike) {
            var root = this._root();
            const promise = DexiePromise.resolve(promiseLike);
            if (root._waitingFor) {
                root._waitingFor = root._waitingFor.then(() => promise);
            }
            else {
                root._waitingFor = promise;
                root._waitingQueue = [];
                var store = root.idbtrans.objectStore(root.storeNames[0]);
                (function spin() {
                    ++root._spinCount;
                    while (root._waitingQueue.length)
                        (root._waitingQueue.shift())();
                    if (root._waitingFor)
                        store.get(-Infinity).onsuccess = spin;
                }());
            }
            var currentWaitPromise = root._waitingFor;
            return new DexiePromise((resolve, reject) => {
                promise.then(res => root._waitingQueue.push(wrap(resolve.bind(null, res))), err => root._waitingQueue.push(wrap(reject.bind(null, err)))).finally(() => {
                    if (root._waitingFor === currentWaitPromise) {
                        root._waitingFor = null;
                    }
                });
            });
        }
        abort() {
            if (this.active) {
                this.active = false;
                if (this.idbtrans)
                    this.idbtrans.abort();
                this._reject(new exceptions.Abort());
            }
        }
        table(tableName) {
            const memoizedTables = (this._memoizedTables || (this._memoizedTables = {}));
            if (hasOwn(memoizedTables, tableName))
                return memoizedTables[tableName];
            const tableSchema = this.schema[tableName];
            if (!tableSchema) {
                throw new exceptions.NotFound("Table " + tableName + " not part of transaction");
            }
            const transactionBoundTable = new this.db.Table(tableName, tableSchema, this);
            transactionBoundTable.core = this.db.core.table(tableName);
            memoizedTables[tableName] = transactionBoundTable;
            return transactionBoundTable;
        }
    }

    function createTransactionConstructor(db) {
        return makeClassConstructor(Transaction.prototype, function Transaction(mode, storeNames, dbschema, chromeTransactionDurability, parent) {
            this.db = db;
            this.mode = mode;
            this.storeNames = storeNames;
            this.schema = dbschema;
            this.chromeTransactionDurability = chromeTransactionDurability;
            this.idbtrans = null;
            this.on = Events(this, "complete", "error", "abort");
            this.parent = parent || null;
            this.active = true;
            this._reculock = 0;
            this._blockedFuncs = [];
            this._resolve = null;
            this._reject = null;
            this._waitingFor = null;
            this._waitingQueue = null;
            this._spinCount = 0;
            this._completion = new DexiePromise((resolve, reject) => {
                this._resolve = resolve;
                this._reject = reject;
            });
            this._completion.then(() => {
                this.active = false;
                this.on.complete.fire();
            }, e => {
                var wasActive = this.active;
                this.active = false;
                this.on.error.fire(e);
                this.parent ?
                    this.parent._reject(e) :
                    wasActive && this.idbtrans && this.idbtrans.abort();
                return rejection(e);
            });
        });
    }

    function createIndexSpec(name, keyPath, unique, multi, auto, compound, isPrimKey) {
        return {
            name,
            keyPath,
            unique,
            multi,
            auto,
            compound,
            src: (unique && !isPrimKey ? '&' : '') + (multi ? '*' : '') + (auto ? "++" : "") + nameFromKeyPath(keyPath)
        };
    }
    function nameFromKeyPath(keyPath) {
        return typeof keyPath === 'string' ?
            keyPath :
            keyPath ? ('[' + [].join.call(keyPath, '+') + ']') : "";
    }

    function createTableSchema(name, primKey, indexes) {
        return {
            name,
            primKey,
            indexes,
            mappedClass: null,
            idxByName: arrayToObject(indexes, index => [index.name, index])
        };
    }

    function safariMultiStoreFix(storeNames) {
        return storeNames.length === 1 ? storeNames[0] : storeNames;
    }
    let getMaxKey = (IdbKeyRange) => {
        try {
            IdbKeyRange.only([[]]);
            getMaxKey = () => [[]];
            return [[]];
        }
        catch (e) {
            getMaxKey = () => maxString;
            return maxString;
        }
    };

    function getKeyExtractor(keyPath) {
        if (keyPath == null) {
            return () => undefined;
        }
        else if (typeof keyPath === 'string') {
            return getSinglePathKeyExtractor(keyPath);
        }
        else {
            return obj => getByKeyPath(obj, keyPath);
        }
    }
    function getSinglePathKeyExtractor(keyPath) {
        const split = keyPath.split('.');
        if (split.length === 1) {
            return obj => obj[keyPath];
        }
        else {
            return obj => getByKeyPath(obj, keyPath);
        }
    }

    function arrayify(arrayLike) {
        return [].slice.call(arrayLike);
    }
    let _id_counter = 0;
    function getKeyPathAlias(keyPath) {
        return keyPath == null ?
            ":id" :
            typeof keyPath === 'string' ?
                keyPath :
                `[${keyPath.join('+')}]`;
    }
    function createDBCore(db, IdbKeyRange, tmpTrans) {
        function extractSchema(db, trans) {
            const tables = arrayify(db.objectStoreNames);
            return {
                schema: {
                    name: db.name,
                    tables: tables.map(table => trans.objectStore(table)).map(store => {
                        const { keyPath, autoIncrement } = store;
                        const compound = isArray(keyPath);
                        const outbound = keyPath == null;
                        const indexByKeyPath = {};
                        const result = {
                            name: store.name,
                            primaryKey: {
                                name: null,
                                isPrimaryKey: true,
                                outbound,
                                compound,
                                keyPath,
                                autoIncrement,
                                unique: true,
                                extractKey: getKeyExtractor(keyPath)
                            },
                            indexes: arrayify(store.indexNames).map(indexName => store.index(indexName))
                                .map(index => {
                                const { name, unique, multiEntry, keyPath } = index;
                                const compound = isArray(keyPath);
                                const result = {
                                    name,
                                    compound,
                                    keyPath,
                                    unique,
                                    multiEntry,
                                    extractKey: getKeyExtractor(keyPath)
                                };
                                indexByKeyPath[getKeyPathAlias(keyPath)] = result;
                                return result;
                            }),
                            getIndexByKeyPath: (keyPath) => indexByKeyPath[getKeyPathAlias(keyPath)]
                        };
                        indexByKeyPath[":id"] = result.primaryKey;
                        if (keyPath != null) {
                            indexByKeyPath[getKeyPathAlias(keyPath)] = result.primaryKey;
                        }
                        return result;
                    })
                },
                hasGetAll: tables.length > 0 && ('getAll' in trans.objectStore(tables[0])) &&
                    !(typeof navigator !== 'undefined' && /Safari/.test(navigator.userAgent) &&
                        !/(Chrome\/|Edge\/)/.test(navigator.userAgent) &&
                        [].concat(navigator.userAgent.match(/Safari\/(\d*)/))[1] < 604)
            };
        }
        function makeIDBKeyRange(range) {
            if (range.type === 3 )
                return null;
            if (range.type === 4 )
                throw new Error("Cannot convert never type to IDBKeyRange");
            const { lower, upper, lowerOpen, upperOpen } = range;
            const idbRange = lower === undefined ?
                upper === undefined ?
                    null :
                    IdbKeyRange.upperBound(upper, !!upperOpen) :
                upper === undefined ?
                    IdbKeyRange.lowerBound(lower, !!lowerOpen) :
                    IdbKeyRange.bound(lower, upper, !!lowerOpen, !!upperOpen);
            return idbRange;
        }
        function createDbCoreTable(tableSchema) {
            const tableName = tableSchema.name;
            function mutate({ trans, type, keys, values, range }) {
                return new Promise((resolve, reject) => {
                    resolve = wrap(resolve);
                    const store = trans.objectStore(tableName);
                    const outbound = store.keyPath == null;
                    const isAddOrPut = type === "put" || type === "add";
                    if (!isAddOrPut && type !== 'delete' && type !== 'deleteRange')
                        throw new Error("Invalid operation type: " + type);
                    const { length } = keys || values || { length: 1 };
                    if (keys && values && keys.length !== values.length) {
                        throw new Error("Given keys array must have same length as given values array.");
                    }
                    if (length === 0)
                        return resolve({ numFailures: 0, failures: {}, results: [], lastResult: undefined });
                    let req;
                    const reqs = [];
                    const failures = [];
                    let numFailures = 0;
                    const errorHandler = event => {
                        ++numFailures;
                        preventDefault(event);
                    };
                    if (type === 'deleteRange') {
                        if (range.type === 4 )
                            return resolve({ numFailures, failures, results: [], lastResult: undefined });
                        if (range.type === 3 )
                            reqs.push(req = store.clear());
                        else
                            reqs.push(req = store.delete(makeIDBKeyRange(range)));
                    }
                    else {
                        const [args1, args2] = isAddOrPut ?
                            outbound ?
                                [values, keys] :
                                [values, null] :
                            [keys, null];
                        if (isAddOrPut) {
                            for (let i = 0; i < length; ++i) {
                                reqs.push(req = (args2 && args2[i] !== undefined ?
                                    store[type](args1[i], args2[i]) :
                                    store[type](args1[i])));
                                req.onerror = errorHandler;
                            }
                        }
                        else {
                            for (let i = 0; i < length; ++i) {
                                reqs.push(req = store[type](args1[i]));
                                req.onerror = errorHandler;
                            }
                        }
                    }
                    const done = event => {
                        const lastResult = event.target.result;
                        reqs.forEach((req, i) => req.error != null && (failures[i] = req.error));
                        resolve({
                            numFailures,
                            failures,
                            results: type === "delete" ? keys : reqs.map(req => req.result),
                            lastResult
                        });
                    };
                    req.onerror = event => {
                        errorHandler(event);
                        done(event);
                    };
                    req.onsuccess = done;
                });
            }
            function openCursor({ trans, values, query, reverse, unique }) {
                return new Promise((resolve, reject) => {
                    resolve = wrap(resolve);
                    const { index, range } = query;
                    const store = trans.objectStore(tableName);
                    const source = index.isPrimaryKey ?
                        store :
                        store.index(index.name);
                    const direction = reverse ?
                        unique ?
                            "prevunique" :
                            "prev" :
                        unique ?
                            "nextunique" :
                            "next";
                    const req = values || !('openKeyCursor' in source) ?
                        source.openCursor(makeIDBKeyRange(range), direction) :
                        source.openKeyCursor(makeIDBKeyRange(range), direction);
                    req.onerror = eventRejectHandler(reject);
                    req.onsuccess = wrap(ev => {
                        const cursor = req.result;
                        if (!cursor) {
                            resolve(null);
                            return;
                        }
                        cursor.___id = ++_id_counter;
                        cursor.done = false;
                        const _cursorContinue = cursor.continue.bind(cursor);
                        let _cursorContinuePrimaryKey = cursor.continuePrimaryKey;
                        if (_cursorContinuePrimaryKey)
                            _cursorContinuePrimaryKey = _cursorContinuePrimaryKey.bind(cursor);
                        const _cursorAdvance = cursor.advance.bind(cursor);
                        const doThrowCursorIsNotStarted = () => { throw new Error("Cursor not started"); };
                        const doThrowCursorIsStopped = () => { throw new Error("Cursor not stopped"); };
                        cursor.trans = trans;
                        cursor.stop = cursor.continue = cursor.continuePrimaryKey = cursor.advance = doThrowCursorIsNotStarted;
                        cursor.fail = wrap(reject);
                        cursor.next = function () {
                            let gotOne = 1;
                            return this.start(() => gotOne-- ? this.continue() : this.stop()).then(() => this);
                        };
                        cursor.start = (callback) => {
                            const iterationPromise = new Promise((resolveIteration, rejectIteration) => {
                                resolveIteration = wrap(resolveIteration);
                                req.onerror = eventRejectHandler(rejectIteration);
                                cursor.fail = rejectIteration;
                                cursor.stop = value => {
                                    cursor.stop = cursor.continue = cursor.continuePrimaryKey = cursor.advance = doThrowCursorIsStopped;
                                    resolveIteration(value);
                                };
                            });
                            const guardedCallback = () => {
                                if (req.result) {
                                    try {
                                        callback();
                                    }
                                    catch (err) {
                                        cursor.fail(err);
                                    }
                                }
                                else {
                                    cursor.done = true;
                                    cursor.start = () => { throw new Error("Cursor behind last entry"); };
                                    cursor.stop();
                                }
                            };
                            req.onsuccess = wrap(ev => {
                                req.onsuccess = guardedCallback;
                                guardedCallback();
                            });
                            cursor.continue = _cursorContinue;
                            cursor.continuePrimaryKey = _cursorContinuePrimaryKey;
                            cursor.advance = _cursorAdvance;
                            guardedCallback();
                            return iterationPromise;
                        };
                        resolve(cursor);
                    }, reject);
                });
            }
            function query(hasGetAll) {
                return (request) => {
                    return new Promise((resolve, reject) => {
                        resolve = wrap(resolve);
                        const { trans, values, limit, query } = request;
                        const nonInfinitLimit = limit === Infinity ? undefined : limit;
                        const { index, range } = query;
                        const store = trans.objectStore(tableName);
                        const source = index.isPrimaryKey ? store : store.index(index.name);
                        const idbKeyRange = makeIDBKeyRange(range);
                        if (limit === 0)
                            return resolve({ result: [] });
                        if (hasGetAll) {
                            const req = values ?
                                source.getAll(idbKeyRange, nonInfinitLimit) :
                                source.getAllKeys(idbKeyRange, nonInfinitLimit);
                            req.onsuccess = event => resolve({ result: event.target.result });
                            req.onerror = eventRejectHandler(reject);
                        }
                        else {
                            let count = 0;
                            const req = values || !('openKeyCursor' in source) ?
                                source.openCursor(idbKeyRange) :
                                source.openKeyCursor(idbKeyRange);
                            const result = [];
                            req.onsuccess = event => {
                                const cursor = req.result;
                                if (!cursor)
                                    return resolve({ result });
                                result.push(values ? cursor.value : cursor.primaryKey);
                                if (++count === limit)
                                    return resolve({ result });
                                cursor.continue();
                            };
                            req.onerror = eventRejectHandler(reject);
                        }
                    });
                };
            }
            return {
                name: tableName,
                schema: tableSchema,
                mutate,
                getMany({ trans, keys }) {
                    return new Promise((resolve, reject) => {
                        resolve = wrap(resolve);
                        const store = trans.objectStore(tableName);
                        const length = keys.length;
                        const result = new Array(length);
                        let keyCount = 0;
                        let callbackCount = 0;
                        let req;
                        const successHandler = event => {
                            const req = event.target;
                            if ((result[req._pos] = req.result) != null)
                                ;
                            if (++callbackCount === keyCount)
                                resolve(result);
                        };
                        const errorHandler = eventRejectHandler(reject);
                        for (let i = 0; i < length; ++i) {
                            const key = keys[i];
                            if (key != null) {
                                req = store.get(keys[i]);
                                req._pos = i;
                                req.onsuccess = successHandler;
                                req.onerror = errorHandler;
                                ++keyCount;
                            }
                        }
                        if (keyCount === 0)
                            resolve(result);
                    });
                },
                get({ trans, key }) {
                    return new Promise((resolve, reject) => {
                        resolve = wrap(resolve);
                        const store = trans.objectStore(tableName);
                        const req = store.get(key);
                        req.onsuccess = event => resolve(event.target.result);
                        req.onerror = eventRejectHandler(reject);
                    });
                },
                query: query(hasGetAll),
                openCursor,
                count({ query, trans }) {
                    const { index, range } = query;
                    return new Promise((resolve, reject) => {
                        const store = trans.objectStore(tableName);
                        const source = index.isPrimaryKey ? store : store.index(index.name);
                        const idbKeyRange = makeIDBKeyRange(range);
                        const req = idbKeyRange ? source.count(idbKeyRange) : source.count();
                        req.onsuccess = wrap(ev => resolve(ev.target.result));
                        req.onerror = eventRejectHandler(reject);
                    });
                }
            };
        }
        const { schema, hasGetAll } = extractSchema(db, tmpTrans);
        const tables = schema.tables.map(tableSchema => createDbCoreTable(tableSchema));
        const tableMap = {};
        tables.forEach(table => tableMap[table.name] = table);
        return {
            stack: "dbcore",
            transaction: db.transaction.bind(db),
            table(name) {
                const result = tableMap[name];
                if (!result)
                    throw new Error(`Table '${name}' not found`);
                return tableMap[name];
            },
            MIN_KEY: -Infinity,
            MAX_KEY: getMaxKey(IdbKeyRange),
            schema
        };
    }

    function createMiddlewareStack(stackImpl, middlewares) {
        return middlewares.reduce((down, { create }) => ({ ...down, ...create(down) }), stackImpl);
    }
    function createMiddlewareStacks(middlewares, idbdb, { IDBKeyRange, indexedDB }, tmpTrans) {
        const dbcore = createMiddlewareStack(createDBCore(idbdb, IDBKeyRange, tmpTrans), middlewares.dbcore);
        return {
            dbcore
        };
    }
    function generateMiddlewareStacks({ _novip: db }, tmpTrans) {
        const idbdb = tmpTrans.db;
        const stacks = createMiddlewareStacks(db._middlewares, idbdb, db._deps, tmpTrans);
        db.core = stacks.dbcore;
        db.tables.forEach(table => {
            const tableName = table.name;
            if (db.core.schema.tables.some(tbl => tbl.name === tableName)) {
                table.core = db.core.table(tableName);
                if (db[tableName] instanceof db.Table) {
                    db[tableName].core = table.core;
                }
            }
        });
    }

    function setApiOnPlace({ _novip: db }, objs, tableNames, dbschema) {
        tableNames.forEach(tableName => {
            const schema = dbschema[tableName];
            objs.forEach(obj => {
                const propDesc = getPropertyDescriptor(obj, tableName);
                if (!propDesc || ("value" in propDesc && propDesc.value === undefined)) {
                    if (obj === db.Transaction.prototype || obj instanceof db.Transaction) {
                        setProp(obj, tableName, {
                            get() { return this.table(tableName); },
                            set(value) {
                                defineProperty(this, tableName, { value, writable: true, configurable: true, enumerable: true });
                            }
                        });
                    }
                    else {
                        obj[tableName] = new db.Table(tableName, schema);
                    }
                }
            });
        });
    }
    function removeTablesApi({ _novip: db }, objs) {
        objs.forEach(obj => {
            for (let key in obj) {
                if (obj[key] instanceof db.Table)
                    delete obj[key];
            }
        });
    }
    function lowerVersionFirst(a, b) {
        return a._cfg.version - b._cfg.version;
    }
    function runUpgraders(db, oldVersion, idbUpgradeTrans, reject) {
        const globalSchema = db._dbSchema;
        const trans = db._createTransaction('readwrite', db._storeNames, globalSchema);
        trans.create(idbUpgradeTrans);
        trans._completion.catch(reject);
        const rejectTransaction = trans._reject.bind(trans);
        const transless = PSD.transless || PSD;
        newScope(() => {
            PSD.trans = trans;
            PSD.transless = transless;
            if (oldVersion === 0) {
                keys(globalSchema).forEach(tableName => {
                    createTable(idbUpgradeTrans, tableName, globalSchema[tableName].primKey, globalSchema[tableName].indexes);
                });
                generateMiddlewareStacks(db, idbUpgradeTrans);
                DexiePromise.follow(() => db.on.populate.fire(trans)).catch(rejectTransaction);
            }
            else
                updateTablesAndIndexes(db, oldVersion, trans, idbUpgradeTrans).catch(rejectTransaction);
        });
    }
    function updateTablesAndIndexes({ _novip: db }, oldVersion, trans, idbUpgradeTrans) {
        const queue = [];
        const versions = db._versions;
        let globalSchema = db._dbSchema = buildGlobalSchema(db, db.idbdb, idbUpgradeTrans);
        let anyContentUpgraderHasRun = false;
        const versToRun = versions.filter(v => v._cfg.version >= oldVersion);
        versToRun.forEach(version => {
            queue.push(() => {
                const oldSchema = globalSchema;
                const newSchema = version._cfg.dbschema;
                adjustToExistingIndexNames(db, oldSchema, idbUpgradeTrans);
                adjustToExistingIndexNames(db, newSchema, idbUpgradeTrans);
                globalSchema = db._dbSchema = newSchema;
                const diff = getSchemaDiff(oldSchema, newSchema);
                diff.add.forEach(tuple => {
                    createTable(idbUpgradeTrans, tuple[0], tuple[1].primKey, tuple[1].indexes);
                });
                diff.change.forEach(change => {
                    if (change.recreate) {
                        throw new exceptions.Upgrade("Not yet support for changing primary key");
                    }
                    else {
                        const store = idbUpgradeTrans.objectStore(change.name);
                        change.add.forEach(idx => addIndex(store, idx));
                        change.change.forEach(idx => {
                            store.deleteIndex(idx.name);
                            addIndex(store, idx);
                        });
                        change.del.forEach(idxName => store.deleteIndex(idxName));
                    }
                });
                const contentUpgrade = version._cfg.contentUpgrade;
                if (contentUpgrade && version._cfg.version > oldVersion) {
                    generateMiddlewareStacks(db, idbUpgradeTrans);
                    trans._memoizedTables = {};
                    anyContentUpgraderHasRun = true;
                    let upgradeSchema = shallowClone(newSchema);
                    diff.del.forEach(table => {
                        upgradeSchema[table] = oldSchema[table];
                    });
                    removeTablesApi(db, [db.Transaction.prototype]);
                    setApiOnPlace(db, [db.Transaction.prototype], keys(upgradeSchema), upgradeSchema);
                    trans.schema = upgradeSchema;
                    const contentUpgradeIsAsync = isAsyncFunction(contentUpgrade);
                    if (contentUpgradeIsAsync) {
                        incrementExpectedAwaits();
                    }
                    let returnValue;
                    const promiseFollowed = DexiePromise.follow(() => {
                        returnValue = contentUpgrade(trans);
                        if (returnValue) {
                            if (contentUpgradeIsAsync) {
                                var decrementor = decrementExpectedAwaits.bind(null, null);
                                returnValue.then(decrementor, decrementor);
                            }
                        }
                    });
                    return (returnValue && typeof returnValue.then === 'function' ?
                        DexiePromise.resolve(returnValue) : promiseFollowed.then(() => returnValue));
                }
            });
            queue.push(idbtrans => {
                if (!anyContentUpgraderHasRun || !hasIEDeleteObjectStoreBug) {
                    const newSchema = version._cfg.dbschema;
                    deleteRemovedTables(newSchema, idbtrans);
                }
                removeTablesApi(db, [db.Transaction.prototype]);
                setApiOnPlace(db, [db.Transaction.prototype], db._storeNames, db._dbSchema);
                trans.schema = db._dbSchema;
            });
        });
        function runQueue() {
            return queue.length ? DexiePromise.resolve(queue.shift()(trans.idbtrans)).then(runQueue) :
                DexiePromise.resolve();
        }
        return runQueue().then(() => {
            createMissingTables(globalSchema, idbUpgradeTrans);
        });
    }
    function getSchemaDiff(oldSchema, newSchema) {
        const diff = {
            del: [],
            add: [],
            change: []
        };
        let table;
        for (table in oldSchema) {
            if (!newSchema[table])
                diff.del.push(table);
        }
        for (table in newSchema) {
            const oldDef = oldSchema[table], newDef = newSchema[table];
            if (!oldDef) {
                diff.add.push([table, newDef]);
            }
            else {
                const change = {
                    name: table,
                    def: newDef,
                    recreate: false,
                    del: [],
                    add: [],
                    change: []
                };
                if ((
                '' + (oldDef.primKey.keyPath || '')) !== ('' + (newDef.primKey.keyPath || '')) ||
                    (oldDef.primKey.auto !== newDef.primKey.auto && !isIEOrEdge))
                 {
                    change.recreate = true;
                    diff.change.push(change);
                }
                else {
                    const oldIndexes = oldDef.idxByName;
                    const newIndexes = newDef.idxByName;
                    let idxName;
                    for (idxName in oldIndexes) {
                        if (!newIndexes[idxName])
                            change.del.push(idxName);
                    }
                    for (idxName in newIndexes) {
                        const oldIdx = oldIndexes[idxName], newIdx = newIndexes[idxName];
                        if (!oldIdx)
                            change.add.push(newIdx);
                        else if (oldIdx.src !== newIdx.src)
                            change.change.push(newIdx);
                    }
                    if (change.del.length > 0 || change.add.length > 0 || change.change.length > 0) {
                        diff.change.push(change);
                    }
                }
            }
        }
        return diff;
    }
    function createTable(idbtrans, tableName, primKey, indexes) {
        const store = idbtrans.db.createObjectStore(tableName, primKey.keyPath ?
            { keyPath: primKey.keyPath, autoIncrement: primKey.auto } :
            { autoIncrement: primKey.auto });
        indexes.forEach(idx => addIndex(store, idx));
        return store;
    }
    function createMissingTables(newSchema, idbtrans) {
        keys(newSchema).forEach(tableName => {
            if (!idbtrans.db.objectStoreNames.contains(tableName)) {
                createTable(idbtrans, tableName, newSchema[tableName].primKey, newSchema[tableName].indexes);
            }
        });
    }
    function deleteRemovedTables(newSchema, idbtrans) {
        [].slice.call(idbtrans.db.objectStoreNames).forEach(storeName => newSchema[storeName] == null && idbtrans.db.deleteObjectStore(storeName));
    }
    function addIndex(store, idx) {
        store.createIndex(idx.name, idx.keyPath, { unique: idx.unique, multiEntry: idx.multi });
    }
    function buildGlobalSchema(db, idbdb, tmpTrans) {
        const globalSchema = {};
        const dbStoreNames = slice(idbdb.objectStoreNames, 0);
        dbStoreNames.forEach(storeName => {
            const store = tmpTrans.objectStore(storeName);
            let keyPath = store.keyPath;
            const primKey = createIndexSpec(nameFromKeyPath(keyPath), keyPath || "", false, false, !!store.autoIncrement, keyPath && typeof keyPath !== "string", true);
            const indexes = [];
            for (let j = 0; j < store.indexNames.length; ++j) {
                const idbindex = store.index(store.indexNames[j]);
                keyPath = idbindex.keyPath;
                var index = createIndexSpec(idbindex.name, keyPath, !!idbindex.unique, !!idbindex.multiEntry, false, keyPath && typeof keyPath !== "string", false);
                indexes.push(index);
            }
            globalSchema[storeName] = createTableSchema(storeName, primKey, indexes);
        });
        return globalSchema;
    }
    function readGlobalSchema({ _novip: db }, idbdb, tmpTrans) {
        db.verno = idbdb.version / 10;
        const globalSchema = db._dbSchema = buildGlobalSchema(db, idbdb, tmpTrans);
        db._storeNames = slice(idbdb.objectStoreNames, 0);
        setApiOnPlace(db, [db._allTables], keys(globalSchema), globalSchema);
    }
    function verifyInstalledSchema(db, tmpTrans) {
        const installedSchema = buildGlobalSchema(db, db.idbdb, tmpTrans);
        const diff = getSchemaDiff(installedSchema, db._dbSchema);
        return !(diff.add.length || diff.change.some(ch => ch.add.length || ch.change.length));
    }
    function adjustToExistingIndexNames({ _novip: db }, schema, idbtrans) {
        const storeNames = idbtrans.db.objectStoreNames;
        for (let i = 0; i < storeNames.length; ++i) {
            const storeName = storeNames[i];
            const store = idbtrans.objectStore(storeName);
            db._hasGetAll = 'getAll' in store;
            for (let j = 0; j < store.indexNames.length; ++j) {
                const indexName = store.indexNames[j];
                const keyPath = store.index(indexName).keyPath;
                const dexieName = typeof keyPath === 'string' ? keyPath : "[" + slice(keyPath).join('+') + "]";
                if (schema[storeName]) {
                    const indexSpec = schema[storeName].idxByName[dexieName];
                    if (indexSpec) {
                        indexSpec.name = indexName;
                        delete schema[storeName].idxByName[dexieName];
                        schema[storeName].idxByName[indexName] = indexSpec;
                    }
                }
            }
        }
        if (typeof navigator !== 'undefined' && /Safari/.test(navigator.userAgent) &&
            !/(Chrome\/|Edge\/)/.test(navigator.userAgent) &&
            _global.WorkerGlobalScope && _global instanceof _global.WorkerGlobalScope &&
            [].concat(navigator.userAgent.match(/Safari\/(\d*)/))[1] < 604) {
            db._hasGetAll = false;
        }
    }
    function parseIndexSyntax(primKeyAndIndexes) {
        return primKeyAndIndexes.split(',').map((index, indexNum) => {
            index = index.trim();
            const name = index.replace(/([&*]|\+\+)/g, "");
            const keyPath = /^\[/.test(name) ? name.match(/^\[(.*)\]$/)[1].split('+') : name;
            return createIndexSpec(name, keyPath || null, /\&/.test(index), /\*/.test(index), /\+\+/.test(index), isArray(keyPath), indexNum === 0);
        });
    }

    class Version {
        _parseStoresSpec(stores, outSchema) {
            keys(stores).forEach(tableName => {
                if (stores[tableName] !== null) {
                    var indexes = parseIndexSyntax(stores[tableName]);
                    var primKey = indexes.shift();
                    if (primKey.multi)
                        throw new exceptions.Schema("Primary key cannot be multi-valued");
                    indexes.forEach(idx => {
                        if (idx.auto)
                            throw new exceptions.Schema("Only primary key can be marked as autoIncrement (++)");
                        if (!idx.keyPath)
                            throw new exceptions.Schema("Index must have a name and cannot be an empty string");
                    });
                    outSchema[tableName] = createTableSchema(tableName, primKey, indexes);
                }
            });
        }
        stores(stores) {
            const db = this.db;
            this._cfg.storesSource = this._cfg.storesSource ?
                extend(this._cfg.storesSource, stores) :
                stores;
            const versions = db._versions;
            const storesSpec = {};
            let dbschema = {};
            versions.forEach(version => {
                extend(storesSpec, version._cfg.storesSource);
                dbschema = (version._cfg.dbschema = {});
                version._parseStoresSpec(storesSpec, dbschema);
            });
            db._dbSchema = dbschema;
            removeTablesApi(db, [db._allTables, db, db.Transaction.prototype]);
            setApiOnPlace(db, [db._allTables, db, db.Transaction.prototype, this._cfg.tables], keys(dbschema), dbschema);
            db._storeNames = keys(dbschema);
            return this;
        }
        upgrade(upgradeFunction) {
            this._cfg.contentUpgrade = promisableChain(this._cfg.contentUpgrade || nop, upgradeFunction);
            return this;
        }
    }

    function createVersionConstructor(db) {
        return makeClassConstructor(Version.prototype, function Version(versionNumber) {
            this.db = db;
            this._cfg = {
                version: versionNumber,
                storesSource: null,
                dbschema: {},
                tables: {},
                contentUpgrade: null
            };
        });
    }

    function getDbNamesTable(indexedDB, IDBKeyRange) {
        let dbNamesDB = indexedDB["_dbNamesDB"];
        if (!dbNamesDB) {
            dbNamesDB = indexedDB["_dbNamesDB"] = new Dexie$1(DBNAMES_DB, {
                addons: [],
                indexedDB,
                IDBKeyRange,
            });
            dbNamesDB.version(1).stores({ dbnames: "name" });
        }
        return dbNamesDB.table("dbnames");
    }
    function hasDatabasesNative(indexedDB) {
        return indexedDB && typeof indexedDB.databases === "function";
    }
    function getDatabaseNames({ indexedDB, IDBKeyRange, }) {
        return hasDatabasesNative(indexedDB)
            ? Promise.resolve(indexedDB.databases()).then((infos) => infos
                .map((info) => info.name)
                .filter((name) => name !== DBNAMES_DB))
            : getDbNamesTable(indexedDB, IDBKeyRange).toCollection().primaryKeys();
    }
    function _onDatabaseCreated({ indexedDB, IDBKeyRange }, name) {
        !hasDatabasesNative(indexedDB) &&
            name !== DBNAMES_DB &&
            getDbNamesTable(indexedDB, IDBKeyRange).put({ name }).catch(nop);
    }
    function _onDatabaseDeleted({ indexedDB, IDBKeyRange }, name) {
        !hasDatabasesNative(indexedDB) &&
            name !== DBNAMES_DB &&
            getDbNamesTable(indexedDB, IDBKeyRange).delete(name).catch(nop);
    }

    function vip(fn) {
        return newScope(function () {
            PSD.letThrough = true;
            return fn();
        });
    }

    function idbReady() {
        var isSafari = !navigator.userAgentData &&
            /Safari\//.test(navigator.userAgent) &&
            !/Chrom(e|ium)\//.test(navigator.userAgent);
        if (!isSafari || !indexedDB.databases)
            return Promise.resolve();
        var intervalId;
        return new Promise(function (resolve) {
            var tryIdb = function () { return indexedDB.databases().finally(resolve); };
            intervalId = setInterval(tryIdb, 100);
            tryIdb();
        }).finally(function () { return clearInterval(intervalId); });
    }

    function dexieOpen(db) {
        const state = db._state;
        const { indexedDB } = db._deps;
        if (state.isBeingOpened || db.idbdb)
            return state.dbReadyPromise.then(() => state.dbOpenError ?
                rejection(state.dbOpenError) :
                db);
        debug && (state.openCanceller._stackHolder = getErrorWithStack());
        state.isBeingOpened = true;
        state.dbOpenError = null;
        state.openComplete = false;
        const openCanceller = state.openCanceller;
        function throwIfCancelled() {
            if (state.openCanceller !== openCanceller)
                throw new exceptions.DatabaseClosed('db.open() was cancelled');
        }
        let resolveDbReady = state.dbReadyResolve,
        upgradeTransaction = null, wasCreated = false;
        return DexiePromise.race([openCanceller, (typeof navigator === 'undefined' ? DexiePromise.resolve() : idbReady()).then(() => new DexiePromise((resolve, reject) => {
                throwIfCancelled();
                if (!indexedDB)
                    throw new exceptions.MissingAPI();
                const dbName = db.name;
                const req = state.autoSchema ?
                    indexedDB.open(dbName) :
                    indexedDB.open(dbName, Math.round(db.verno * 10));
                if (!req)
                    throw new exceptions.MissingAPI();
                req.onerror = eventRejectHandler(reject);
                req.onblocked = wrap(db._fireOnBlocked);
                req.onupgradeneeded = wrap(e => {
                    upgradeTransaction = req.transaction;
                    if (state.autoSchema && !db._options.allowEmptyDB) {
                        req.onerror = preventDefault;
                        upgradeTransaction.abort();
                        req.result.close();
                        const delreq = indexedDB.deleteDatabase(dbName);
                        delreq.onsuccess = delreq.onerror = wrap(() => {
                            reject(new exceptions.NoSuchDatabase(`Database ${dbName} doesnt exist`));
                        });
                    }
                    else {
                        upgradeTransaction.onerror = eventRejectHandler(reject);
                        var oldVer = e.oldVersion > Math.pow(2, 62) ? 0 : e.oldVersion;
                        wasCreated = oldVer < 1;
                        db._novip.idbdb = req.result;
                        runUpgraders(db, oldVer / 10, upgradeTransaction, reject);
                    }
                }, reject);
                req.onsuccess = wrap(() => {
                    upgradeTransaction = null;
                    const idbdb = db._novip.idbdb = req.result;
                    const objectStoreNames = slice(idbdb.objectStoreNames);
                    if (objectStoreNames.length > 0)
                        try {
                            const tmpTrans = idbdb.transaction(safariMultiStoreFix(objectStoreNames), 'readonly');
                            if (state.autoSchema)
                                readGlobalSchema(db, idbdb, tmpTrans);
                            else {
                                adjustToExistingIndexNames(db, db._dbSchema, tmpTrans);
                                if (!verifyInstalledSchema(db, tmpTrans)) {
                                    console.warn(`Dexie SchemaDiff: Schema was extended without increasing the number passed to db.version(). Some queries may fail.`);
                                }
                            }
                            generateMiddlewareStacks(db, tmpTrans);
                        }
                        catch (e) {
                        }
                    connections.push(db);
                    idbdb.onversionchange = wrap(ev => {
                        state.vcFired = true;
                        db.on("versionchange").fire(ev);
                    });
                    idbdb.onclose = wrap(ev => {
                        db.on("close").fire(ev);
                    });
                    if (wasCreated)
                        _onDatabaseCreated(db._deps, dbName);
                    resolve();
                }, reject);
            }))]).then(() => {
            throwIfCancelled();
            state.onReadyBeingFired = [];
            return DexiePromise.resolve(vip(() => db.on.ready.fire(db.vip))).then(function fireRemainders() {
                if (state.onReadyBeingFired.length > 0) {
                    let remainders = state.onReadyBeingFired.reduce(promisableChain, nop);
                    state.onReadyBeingFired = [];
                    return DexiePromise.resolve(vip(() => remainders(db.vip))).then(fireRemainders);
                }
            });
        }).finally(() => {
            state.onReadyBeingFired = null;
            state.isBeingOpened = false;
        }).then(() => {
            return db;
        }).catch(err => {
            state.dbOpenError = err;
            try {
                upgradeTransaction && upgradeTransaction.abort();
            }
            catch (_a) { }
            if (openCanceller === state.openCanceller) {
                db._close();
            }
            return rejection(err);
        }).finally(() => {
            state.openComplete = true;
            resolveDbReady();
        });
    }

    function awaitIterator(iterator) {
        var callNext = result => iterator.next(result), doThrow = error => iterator.throw(error), onSuccess = step(callNext), onError = step(doThrow);
        function step(getNext) {
            return (val) => {
                var next = getNext(val), value = next.value;
                return next.done ? value :
                    (!value || typeof value.then !== 'function' ?
                        isArray(value) ? Promise.all(value).then(onSuccess, onError) : onSuccess(value) :
                        value.then(onSuccess, onError));
            };
        }
        return step(callNext)();
    }

    function extractTransactionArgs(mode, _tableArgs_, scopeFunc) {
        var i = arguments.length;
        if (i < 2)
            throw new exceptions.InvalidArgument("Too few arguments");
        var args = new Array(i - 1);
        while (--i)
            args[i - 1] = arguments[i];
        scopeFunc = args.pop();
        var tables = flatten(args);
        return [mode, tables, scopeFunc];
    }
    function enterTransactionScope(db, mode, storeNames, parentTransaction, scopeFunc) {
        return DexiePromise.resolve().then(() => {
            const transless = PSD.transless || PSD;
            const trans = db._createTransaction(mode, storeNames, db._dbSchema, parentTransaction);
            const zoneProps = {
                trans: trans,
                transless: transless
            };
            if (parentTransaction) {
                trans.idbtrans = parentTransaction.idbtrans;
            }
            else {
                try {
                    trans.create();
                    db._state.PR1398_maxLoop = 3;
                }
                catch (ex) {
                    if (ex.name === errnames.InvalidState && db.isOpen() && --db._state.PR1398_maxLoop > 0) {
                        console.warn('Dexie: Need to reopen db');
                        db._close();
                        return db.open().then(() => enterTransactionScope(db, mode, storeNames, null, scopeFunc));
                    }
                    return rejection(ex);
                }
            }
            const scopeFuncIsAsync = isAsyncFunction(scopeFunc);
            if (scopeFuncIsAsync) {
                incrementExpectedAwaits();
            }
            let returnValue;
            const promiseFollowed = DexiePromise.follow(() => {
                returnValue = scopeFunc.call(trans, trans);
                if (returnValue) {
                    if (scopeFuncIsAsync) {
                        var decrementor = decrementExpectedAwaits.bind(null, null);
                        returnValue.then(decrementor, decrementor);
                    }
                    else if (typeof returnValue.next === 'function' && typeof returnValue.throw === 'function') {
                        returnValue = awaitIterator(returnValue);
                    }
                }
            }, zoneProps);
            return (returnValue && typeof returnValue.then === 'function' ?
                DexiePromise.resolve(returnValue).then(x => trans.active ?
                    x
                    : rejection(new exceptions.PrematureCommit("Transaction committed too early. See http://bit.ly/2kdckMn")))
                : promiseFollowed.then(() => returnValue)).then(x => {
                if (parentTransaction)
                    trans._resolve();
                return trans._completion.then(() => x);
            }).catch(e => {
                trans._reject(e);
                return rejection(e);
            });
        });
    }

    function pad(a, value, count) {
        const result = isArray(a) ? a.slice() : [a];
        for (let i = 0; i < count; ++i)
            result.push(value);
        return result;
    }
    function createVirtualIndexMiddleware(down) {
        return {
            ...down,
            table(tableName) {
                const table = down.table(tableName);
                const { schema } = table;
                const indexLookup = {};
                const allVirtualIndexes = [];
                function addVirtualIndexes(keyPath, keyTail, lowLevelIndex) {
                    const keyPathAlias = getKeyPathAlias(keyPath);
                    const indexList = (indexLookup[keyPathAlias] = indexLookup[keyPathAlias] || []);
                    const keyLength = keyPath == null ? 0 : typeof keyPath === 'string' ? 1 : keyPath.length;
                    const isVirtual = keyTail > 0;
                    const virtualIndex = {
                        ...lowLevelIndex,
                        isVirtual,
                        keyTail,
                        keyLength,
                        extractKey: getKeyExtractor(keyPath),
                        unique: !isVirtual && lowLevelIndex.unique
                    };
                    indexList.push(virtualIndex);
                    if (!virtualIndex.isPrimaryKey) {
                        allVirtualIndexes.push(virtualIndex);
                    }
                    if (keyLength > 1) {
                        const virtualKeyPath = keyLength === 2 ?
                            keyPath[0] :
                            keyPath.slice(0, keyLength - 1);
                        addVirtualIndexes(virtualKeyPath, keyTail + 1, lowLevelIndex);
                    }
                    indexList.sort((a, b) => a.keyTail - b.keyTail);
                    return virtualIndex;
                }
                const primaryKey = addVirtualIndexes(schema.primaryKey.keyPath, 0, schema.primaryKey);
                indexLookup[":id"] = [primaryKey];
                for (const index of schema.indexes) {
                    addVirtualIndexes(index.keyPath, 0, index);
                }
                function findBestIndex(keyPath) {
                    const result = indexLookup[getKeyPathAlias(keyPath)];
                    return result && result[0];
                }
                function translateRange(range, keyTail) {
                    return {
                        type: range.type === 1  ?
                            2  :
                            range.type,
                        lower: pad(range.lower, range.lowerOpen ? down.MAX_KEY : down.MIN_KEY, keyTail),
                        lowerOpen: true,
                        upper: pad(range.upper, range.upperOpen ? down.MIN_KEY : down.MAX_KEY, keyTail),
                        upperOpen: true
                    };
                }
                function translateRequest(req) {
                    const index = req.query.index;
                    return index.isVirtual ? {
                        ...req,
                        query: {
                            index,
                            range: translateRange(req.query.range, index.keyTail)
                        }
                    } : req;
                }
                const result = {
                    ...table,
                    schema: {
                        ...schema,
                        primaryKey,
                        indexes: allVirtualIndexes,
                        getIndexByKeyPath: findBestIndex
                    },
                    count(req) {
                        return table.count(translateRequest(req));
                    },
                    query(req) {
                        return table.query(translateRequest(req));
                    },
                    openCursor(req) {
                        const { keyTail, isVirtual, keyLength } = req.query.index;
                        if (!isVirtual)
                            return table.openCursor(req);
                        function createVirtualCursor(cursor) {
                            function _continue(key) {
                                key != null ?
                                    cursor.continue(pad(key, req.reverse ? down.MAX_KEY : down.MIN_KEY, keyTail)) :
                                    req.unique ?
                                        cursor.continue(cursor.key.slice(0, keyLength)
                                            .concat(req.reverse
                                            ? down.MIN_KEY
                                            : down.MAX_KEY, keyTail)) :
                                        cursor.continue();
                            }
                            const virtualCursor = Object.create(cursor, {
                                continue: { value: _continue },
                                continuePrimaryKey: {
                                    value(key, primaryKey) {
                                        cursor.continuePrimaryKey(pad(key, down.MAX_KEY, keyTail), primaryKey);
                                    }
                                },
                                primaryKey: {
                                    get() {
                                        return cursor.primaryKey;
                                    }
                                },
                                key: {
                                    get() {
                                        const key = cursor.key;
                                        return keyLength === 1 ?
                                            key[0] :
                                            key.slice(0, keyLength);
                                    }
                                },
                                value: {
                                    get() {
                                        return cursor.value;
                                    }
                                }
                            });
                            return virtualCursor;
                        }
                        return table.openCursor(translateRequest(req))
                            .then(cursor => cursor && createVirtualCursor(cursor));
                    }
                };
                return result;
            }
        };
    }
    const virtualIndexMiddleware = {
        stack: "dbcore",
        name: "VirtualIndexMiddleware",
        level: 1,
        create: createVirtualIndexMiddleware
    };

    function getObjectDiff(a, b, rv, prfx) {
        rv = rv || {};
        prfx = prfx || '';
        keys(a).forEach((prop) => {
            if (!hasOwn(b, prop)) {
                rv[prfx + prop] = undefined;
            }
            else {
                var ap = a[prop], bp = b[prop];
                if (typeof ap === 'object' && typeof bp === 'object' && ap && bp) {
                    const apTypeName = toStringTag(ap);
                    const bpTypeName = toStringTag(bp);
                    if (apTypeName !== bpTypeName) {
                        rv[prfx + prop] = b[prop];
                    }
                    else if (apTypeName === 'Object') {
                        getObjectDiff(ap, bp, rv, prfx + prop + '.');
                    }
                    else if (ap !== bp) {
                        rv[prfx + prop] = b[prop];
                    }
                }
                else if (ap !== bp)
                    rv[prfx + prop] = b[prop];
            }
        });
        keys(b).forEach((prop) => {
            if (!hasOwn(a, prop)) {
                rv[prfx + prop] = b[prop];
            }
        });
        return rv;
    }

    function getEffectiveKeys(primaryKey, req) {
        if (req.type === 'delete')
            return req.keys;
        return req.keys || req.values.map(primaryKey.extractKey);
    }

    const hooksMiddleware = {
        stack: "dbcore",
        name: "HooksMiddleware",
        level: 2,
        create: (downCore) => ({
            ...downCore,
            table(tableName) {
                const downTable = downCore.table(tableName);
                const { primaryKey } = downTable.schema;
                const tableMiddleware = {
                    ...downTable,
                    mutate(req) {
                        const dxTrans = PSD.trans;
                        const { deleting, creating, updating } = dxTrans.table(tableName).hook;
                        switch (req.type) {
                            case 'add':
                                if (creating.fire === nop)
                                    break;
                                return dxTrans._promise('readwrite', () => addPutOrDelete(req), true);
                            case 'put':
                                if (creating.fire === nop && updating.fire === nop)
                                    break;
                                return dxTrans._promise('readwrite', () => addPutOrDelete(req), true);
                            case 'delete':
                                if (deleting.fire === nop)
                                    break;
                                return dxTrans._promise('readwrite', () => addPutOrDelete(req), true);
                            case 'deleteRange':
                                if (deleting.fire === nop)
                                    break;
                                return dxTrans._promise('readwrite', () => deleteRange(req), true);
                        }
                        return downTable.mutate(req);
                        function addPutOrDelete(req) {
                            const dxTrans = PSD.trans;
                            const keys = req.keys || getEffectiveKeys(primaryKey, req);
                            if (!keys)
                                throw new Error("Keys missing");
                            req = req.type === 'add' || req.type === 'put' ?
                                { ...req, keys } :
                                { ...req };
                            if (req.type !== 'delete')
                                req.values = [...req.values];
                            if (req.keys)
                                req.keys = [...req.keys];
                            return getExistingValues(downTable, req, keys).then(existingValues => {
                                const contexts = keys.map((key, i) => {
                                    const existingValue = existingValues[i];
                                    const ctx = { onerror: null, onsuccess: null };
                                    if (req.type === 'delete') {
                                        deleting.fire.call(ctx, key, existingValue, dxTrans);
                                    }
                                    else if (req.type === 'add' || existingValue === undefined) {
                                        const generatedPrimaryKey = creating.fire.call(ctx, key, req.values[i], dxTrans);
                                        if (key == null && generatedPrimaryKey != null) {
                                            key = generatedPrimaryKey;
                                            req.keys[i] = key;
                                            if (!primaryKey.outbound) {
                                                setByKeyPath(req.values[i], primaryKey.keyPath, key);
                                            }
                                        }
                                    }
                                    else {
                                        const objectDiff = getObjectDiff(existingValue, req.values[i]);
                                        const additionalChanges = updating.fire.call(ctx, objectDiff, key, existingValue, dxTrans);
                                        if (additionalChanges) {
                                            const requestedValue = req.values[i];
                                            Object.keys(additionalChanges).forEach(keyPath => {
                                                if (hasOwn(requestedValue, keyPath)) {
                                                    requestedValue[keyPath] = additionalChanges[keyPath];
                                                }
                                                else {
                                                    setByKeyPath(requestedValue, keyPath, additionalChanges[keyPath]);
                                                }
                                            });
                                        }
                                    }
                                    return ctx;
                                });
                                return downTable.mutate(req).then(({ failures, results, numFailures, lastResult }) => {
                                    for (let i = 0; i < keys.length; ++i) {
                                        const primKey = results ? results[i] : keys[i];
                                        const ctx = contexts[i];
                                        if (primKey == null) {
                                            ctx.onerror && ctx.onerror(failures[i]);
                                        }
                                        else {
                                            ctx.onsuccess && ctx.onsuccess(req.type === 'put' && existingValues[i] ?
                                                req.values[i] :
                                                primKey
                                            );
                                        }
                                    }
                                    return { failures, results, numFailures, lastResult };
                                }).catch(error => {
                                    contexts.forEach(ctx => ctx.onerror && ctx.onerror(error));
                                    return Promise.reject(error);
                                });
                            });
                        }
                        function deleteRange(req) {
                            return deleteNextChunk(req.trans, req.range, 10000);
                        }
                        function deleteNextChunk(trans, range, limit) {
                            return downTable.query({ trans, values: false, query: { index: primaryKey, range }, limit })
                                .then(({ result }) => {
                                return addPutOrDelete({ type: 'delete', keys: result, trans }).then(res => {
                                    if (res.numFailures > 0)
                                        return Promise.reject(res.failures[0]);
                                    if (result.length < limit) {
                                        return { failures: [], numFailures: 0, lastResult: undefined };
                                    }
                                    else {
                                        return deleteNextChunk(trans, { ...range, lower: result[result.length - 1], lowerOpen: true }, limit);
                                    }
                                });
                            });
                        }
                    }
                };
                return tableMiddleware;
            },
        })
    };
    function getExistingValues(table, req, effectiveKeys) {
        return req.type === "add"
            ? Promise.resolve([])
            : table.getMany({ trans: req.trans, keys: effectiveKeys, cache: "immutable" });
    }

    function getFromTransactionCache(keys, cache, clone) {
        try {
            if (!cache)
                return null;
            if (cache.keys.length < keys.length)
                return null;
            const result = [];
            for (let i = 0, j = 0; i < cache.keys.length && j < keys.length; ++i) {
                if (cmp(cache.keys[i], keys[j]) !== 0)
                    continue;
                result.push(clone ? deepClone(cache.values[i]) : cache.values[i]);
                ++j;
            }
            return result.length === keys.length ? result : null;
        }
        catch (_a) {
            return null;
        }
    }
    const cacheExistingValuesMiddleware = {
        stack: "dbcore",
        level: -1,
        create: (core) => {
            return {
                table: (tableName) => {
                    const table = core.table(tableName);
                    return {
                        ...table,
                        getMany: (req) => {
                            if (!req.cache) {
                                return table.getMany(req);
                            }
                            const cachedResult = getFromTransactionCache(req.keys, req.trans["_cache"], req.cache === "clone");
                            if (cachedResult) {
                                return DexiePromise.resolve(cachedResult);
                            }
                            return table.getMany(req).then((res) => {
                                req.trans["_cache"] = {
                                    keys: req.keys,
                                    values: req.cache === "clone" ? deepClone(res) : res,
                                };
                                return res;
                            });
                        },
                        mutate: (req) => {
                            if (req.type !== "add")
                                req.trans["_cache"] = null;
                            return table.mutate(req);
                        },
                    };
                },
            };
        },
    };

    function isEmptyRange(node) {
        return !("from" in node);
    }
    const RangeSet = function (fromOrTree, to) {
        if (this) {
            extend(this, arguments.length ? { d: 1, from: fromOrTree, to: arguments.length > 1 ? to : fromOrTree } : { d: 0 });
        }
        else {
            const rv = new RangeSet();
            if (fromOrTree && ("d" in fromOrTree)) {
                extend(rv, fromOrTree);
            }
            return rv;
        }
    };
    props(RangeSet.prototype, {
        add(rangeSet) {
            mergeRanges(this, rangeSet);
            return this;
        },
        addKey(key) {
            addRange(this, key, key);
            return this;
        },
        addKeys(keys) {
            keys.forEach(key => addRange(this, key, key));
            return this;
        },
        [iteratorSymbol]() {
            return getRangeSetIterator(this);
        }
    });
    function addRange(target, from, to) {
        const diff = cmp(from, to);
        if (isNaN(diff))
            return;
        if (diff > 0)
            throw RangeError();
        if (isEmptyRange(target))
            return extend(target, { from, to, d: 1 });
        const left = target.l;
        const right = target.r;
        if (cmp(to, target.from) < 0) {
            left
                ? addRange(left, from, to)
                : (target.l = { from, to, d: 1, l: null, r: null });
            return rebalance(target);
        }
        if (cmp(from, target.to) > 0) {
            right
                ? addRange(right, from, to)
                : (target.r = { from, to, d: 1, l: null, r: null });
            return rebalance(target);
        }
        if (cmp(from, target.from) < 0) {
            target.from = from;
            target.l = null;
            target.d = right ? right.d + 1 : 1;
        }
        if (cmp(to, target.to) > 0) {
            target.to = to;
            target.r = null;
            target.d = target.l ? target.l.d + 1 : 1;
        }
        const rightWasCutOff = !target.r;
        if (left && !target.l) {
            mergeRanges(target, left);
        }
        if (right && rightWasCutOff) {
            mergeRanges(target, right);
        }
    }
    function mergeRanges(target, newSet) {
        function _addRangeSet(target, { from, to, l, r }) {
            addRange(target, from, to);
            if (l)
                _addRangeSet(target, l);
            if (r)
                _addRangeSet(target, r);
        }
        if (!isEmptyRange(newSet))
            _addRangeSet(target, newSet);
    }
    function rangesOverlap(rangeSet1, rangeSet2) {
        const i1 = getRangeSetIterator(rangeSet2);
        let nextResult1 = i1.next();
        if (nextResult1.done)
            return false;
        let a = nextResult1.value;
        const i2 = getRangeSetIterator(rangeSet1);
        let nextResult2 = i2.next(a.from);
        let b = nextResult2.value;
        while (!nextResult1.done && !nextResult2.done) {
            if (cmp(b.from, a.to) <= 0 && cmp(b.to, a.from) >= 0)
                return true;
            cmp(a.from, b.from) < 0
                ? (a = (nextResult1 = i1.next(b.from)).value)
                : (b = (nextResult2 = i2.next(a.from)).value);
        }
        return false;
    }
    function getRangeSetIterator(node) {
        let state = isEmptyRange(node) ? null : { s: 0, n: node };
        return {
            next(key) {
                const keyProvided = arguments.length > 0;
                while (state) {
                    switch (state.s) {
                        case 0:
                            state.s = 1;
                            if (keyProvided) {
                                while (state.n.l && cmp(key, state.n.from) < 0)
                                    state = { up: state, n: state.n.l, s: 1 };
                            }
                            else {
                                while (state.n.l)
                                    state = { up: state, n: state.n.l, s: 1 };
                            }
                        case 1:
                            state.s = 2;
                            if (!keyProvided || cmp(key, state.n.to) <= 0)
                                return { value: state.n, done: false };
                        case 2:
                            if (state.n.r) {
                                state.s = 3;
                                state = { up: state, n: state.n.r, s: 0 };
                                continue;
                            }
                        case 3:
                            state = state.up;
                    }
                }
                return { done: true };
            },
        };
    }
    function rebalance(target) {
        var _a, _b;
        const diff = (((_a = target.r) === null || _a === void 0 ? void 0 : _a.d) || 0) - (((_b = target.l) === null || _b === void 0 ? void 0 : _b.d) || 0);
        const r = diff > 1 ? "r" : diff < -1 ? "l" : "";
        if (r) {
            const l = r === "r" ? "l" : "r";
            const rootClone = { ...target };
            const oldRootRight = target[r];
            target.from = oldRootRight.from;
            target.to = oldRootRight.to;
            target[r] = oldRootRight[r];
            rootClone[r] = oldRootRight[l];
            target[l] = rootClone;
            rootClone.d = computeDepth(rootClone);
        }
        target.d = computeDepth(target);
    }
    function computeDepth({ r, l }) {
        return (r ? (l ? Math.max(r.d, l.d) : r.d) : l ? l.d : 0) + 1;
    }

    const observabilityMiddleware = {
        stack: "dbcore",
        level: 0,
        create: (core) => {
            const dbName = core.schema.name;
            const FULL_RANGE = new RangeSet(core.MIN_KEY, core.MAX_KEY);
            return {
                ...core,
                table: (tableName) => {
                    const table = core.table(tableName);
                    const { schema } = table;
                    const { primaryKey } = schema;
                    const { extractKey, outbound } = primaryKey;
                    const tableClone = {
                        ...table,
                        mutate: (req) => {
                            const trans = req.trans;
                            const mutatedParts = trans.mutatedParts || (trans.mutatedParts = {});
                            const getRangeSet = (indexName) => {
                                const part = `idb://${dbName}/${tableName}/${indexName}`;
                                return (mutatedParts[part] ||
                                    (mutatedParts[part] = new RangeSet()));
                            };
                            const pkRangeSet = getRangeSet("");
                            const delsRangeSet = getRangeSet(":dels");
                            const { type } = req;
                            let [keys, newObjs] = req.type === "deleteRange"
                                ? [req.range]
                                : req.type === "delete"
                                    ? [req.keys]
                                    : req.values.length < 50
                                        ? [[], req.values]
                                        : [];
                            const oldCache = req.trans["_cache"];
                            return table.mutate(req).then((res) => {
                                if (isArray(keys)) {
                                    if (type !== "delete")
                                        keys = res.results;
                                    pkRangeSet.addKeys(keys);
                                    const oldObjs = getFromTransactionCache(keys, oldCache);
                                    if (!oldObjs && type !== "add") {
                                        delsRangeSet.addKeys(keys);
                                    }
                                    if (oldObjs || newObjs) {
                                        trackAffectedIndexes(getRangeSet, schema, oldObjs, newObjs);
                                    }
                                }
                                else if (keys) {
                                    const range = { from: keys.lower, to: keys.upper };
                                    delsRangeSet.add(range);
                                    pkRangeSet.add(range);
                                }
                                else {
                                    pkRangeSet.add(FULL_RANGE);
                                    delsRangeSet.add(FULL_RANGE);
                                    schema.indexes.forEach(idx => getRangeSet(idx.name).add(FULL_RANGE));
                                }
                                return res;
                            });
                        },
                    };
                    const getRange = ({ query: { index, range }, }) => {
                        var _a, _b;
                        return [
                            index,
                            new RangeSet((_a = range.lower) !== null && _a !== void 0 ? _a : core.MIN_KEY, (_b = range.upper) !== null && _b !== void 0 ? _b : core.MAX_KEY),
                        ];
                    };
                    const readSubscribers = {
                        get: (req) => [primaryKey, new RangeSet(req.key)],
                        getMany: (req) => [primaryKey, new RangeSet().addKeys(req.keys)],
                        count: getRange,
                        query: getRange,
                        openCursor: getRange,
                    };
                    keys(readSubscribers).forEach(method => {
                        tableClone[method] = function (req) {
                            const { subscr } = PSD;
                            if (subscr) {
                                const getRangeSet = (indexName) => {
                                    const part = `idb://${dbName}/${tableName}/${indexName}`;
                                    return (subscr[part] ||
                                        (subscr[part] = new RangeSet()));
                                };
                                const pkRangeSet = getRangeSet("");
                                const delsRangeSet = getRangeSet(":dels");
                                const [queriedIndex, queriedRanges] = readSubscribers[method](req);
                                getRangeSet(queriedIndex.name || "").add(queriedRanges);
                                if (!queriedIndex.isPrimaryKey) {
                                    if (method === "count") {
                                        delsRangeSet.add(FULL_RANGE);
                                    }
                                    else {
                                        const keysPromise = method === "query" &&
                                            outbound &&
                                            req.values &&
                                            table.query({
                                                ...req,
                                                values: false,
                                            });
                                        return table[method].apply(this, arguments).then((res) => {
                                            if (method === "query") {
                                                if (outbound && req.values) {
                                                    return keysPromise.then(({ result: resultingKeys }) => {
                                                        pkRangeSet.addKeys(resultingKeys);
                                                        return res;
                                                    });
                                                }
                                                const pKeys = req.values
                                                    ? res.result.map(extractKey)
                                                    : res.result;
                                                if (req.values) {
                                                    pkRangeSet.addKeys(pKeys);
                                                }
                                                else {
                                                    delsRangeSet.addKeys(pKeys);
                                                }
                                            }
                                            else if (method === "openCursor") {
                                                const cursor = res;
                                                const wantValues = req.values;
                                                return (cursor &&
                                                    Object.create(cursor, {
                                                        key: {
                                                            get() {
                                                                delsRangeSet.addKey(cursor.primaryKey);
                                                                return cursor.key;
                                                            },
                                                        },
                                                        primaryKey: {
                                                            get() {
                                                                const pkey = cursor.primaryKey;
                                                                delsRangeSet.addKey(pkey);
                                                                return pkey;
                                                            },
                                                        },
                                                        value: {
                                                            get() {
                                                                wantValues && pkRangeSet.addKey(cursor.primaryKey);
                                                                return cursor.value;
                                                            },
                                                        },
                                                    }));
                                            }
                                            return res;
                                        });
                                    }
                                }
                            }
                            return table[method].apply(this, arguments);
                        };
                    });
                    return tableClone;
                },
            };
        },
    };
    function trackAffectedIndexes(getRangeSet, schema, oldObjs, newObjs) {
        function addAffectedIndex(ix) {
            const rangeSet = getRangeSet(ix.name || "");
            function extractKey(obj) {
                return obj != null ? ix.extractKey(obj) : null;
            }
            const addKeyOrKeys = (key) => ix.multiEntry && isArray(key)
                ? key.forEach(key => rangeSet.addKey(key))
                : rangeSet.addKey(key);
            (oldObjs || newObjs).forEach((_, i) => {
                const oldKey = oldObjs && extractKey(oldObjs[i]);
                const newKey = newObjs && extractKey(newObjs[i]);
                if (cmp(oldKey, newKey) !== 0) {
                    if (oldKey != null)
                        addKeyOrKeys(oldKey);
                    if (newKey != null)
                        addKeyOrKeys(newKey);
                }
            });
        }
        schema.indexes.forEach(addAffectedIndex);
    }

    class Dexie$1 {
        constructor(name, options) {
            this._middlewares = {};
            this.verno = 0;
            const deps = Dexie$1.dependencies;
            this._options = options = {
                addons: Dexie$1.addons,
                autoOpen: true,
                indexedDB: deps.indexedDB,
                IDBKeyRange: deps.IDBKeyRange,
                ...options
            };
            this._deps = {
                indexedDB: options.indexedDB,
                IDBKeyRange: options.IDBKeyRange
            };
            const { addons, } = options;
            this._dbSchema = {};
            this._versions = [];
            this._storeNames = [];
            this._allTables = {};
            this.idbdb = null;
            this._novip = this;
            const state = {
                dbOpenError: null,
                isBeingOpened: false,
                onReadyBeingFired: null,
                openComplete: false,
                dbReadyResolve: nop,
                dbReadyPromise: null,
                cancelOpen: nop,
                openCanceller: null,
                autoSchema: true,
                PR1398_maxLoop: 3
            };
            state.dbReadyPromise = new DexiePromise(resolve => {
                state.dbReadyResolve = resolve;
            });
            state.openCanceller = new DexiePromise((_, reject) => {
                state.cancelOpen = reject;
            });
            this._state = state;
            this.name = name;
            this.on = Events(this, "populate", "blocked", "versionchange", "close", { ready: [promisableChain, nop] });
            this.on.ready.subscribe = override(this.on.ready.subscribe, subscribe => {
                return (subscriber, bSticky) => {
                    Dexie$1.vip(() => {
                        const state = this._state;
                        if (state.openComplete) {
                            if (!state.dbOpenError)
                                DexiePromise.resolve().then(subscriber);
                            if (bSticky)
                                subscribe(subscriber);
                        }
                        else if (state.onReadyBeingFired) {
                            state.onReadyBeingFired.push(subscriber);
                            if (bSticky)
                                subscribe(subscriber);
                        }
                        else {
                            subscribe(subscriber);
                            const db = this;
                            if (!bSticky)
                                subscribe(function unsubscribe() {
                                    db.on.ready.unsubscribe(subscriber);
                                    db.on.ready.unsubscribe(unsubscribe);
                                });
                        }
                    });
                };
            });
            this.Collection = createCollectionConstructor(this);
            this.Table = createTableConstructor(this);
            this.Transaction = createTransactionConstructor(this);
            this.Version = createVersionConstructor(this);
            this.WhereClause = createWhereClauseConstructor(this);
            this.on("versionchange", ev => {
                if (ev.newVersion > 0)
                    console.warn(`Another connection wants to upgrade database '${this.name}'. Closing db now to resume the upgrade.`);
                else
                    console.warn(`Another connection wants to delete database '${this.name}'. Closing db now to resume the delete request.`);
                this.close();
            });
            this.on("blocked", ev => {
                if (!ev.newVersion || ev.newVersion < ev.oldVersion)
                    console.warn(`Dexie.delete('${this.name}') was blocked`);
                else
                    console.warn(`Upgrade '${this.name}' blocked by other connection holding version ${ev.oldVersion / 10}`);
            });
            this._maxKey = getMaxKey(options.IDBKeyRange);
            this._createTransaction = (mode, storeNames, dbschema, parentTransaction) => new this.Transaction(mode, storeNames, dbschema, this._options.chromeTransactionDurability, parentTransaction);
            this._fireOnBlocked = ev => {
                this.on("blocked").fire(ev);
                connections
                    .filter(c => c.name === this.name && c !== this && !c._state.vcFired)
                    .map(c => c.on("versionchange").fire(ev));
            };
            this.use(virtualIndexMiddleware);
            this.use(hooksMiddleware);
            this.use(observabilityMiddleware);
            this.use(cacheExistingValuesMiddleware);
            this.vip = Object.create(this, { _vip: { value: true } });
            addons.forEach(addon => addon(this));
        }
        version(versionNumber) {
            if (isNaN(versionNumber) || versionNumber < 0.1)
                throw new exceptions.Type(`Given version is not a positive number`);
            versionNumber = Math.round(versionNumber * 10) / 10;
            if (this.idbdb || this._state.isBeingOpened)
                throw new exceptions.Schema("Cannot add version when database is open");
            this.verno = Math.max(this.verno, versionNumber);
            const versions = this._versions;
            var versionInstance = versions.filter(v => v._cfg.version === versionNumber)[0];
            if (versionInstance)
                return versionInstance;
            versionInstance = new this.Version(versionNumber);
            versions.push(versionInstance);
            versions.sort(lowerVersionFirst);
            versionInstance.stores({});
            this._state.autoSchema = false;
            return versionInstance;
        }
        _whenReady(fn) {
            return (this.idbdb && (this._state.openComplete || PSD.letThrough || this._vip)) ? fn() : new DexiePromise((resolve, reject) => {
                if (this._state.openComplete) {
                    return reject(new exceptions.DatabaseClosed(this._state.dbOpenError));
                }
                if (!this._state.isBeingOpened) {
                    if (!this._options.autoOpen) {
                        reject(new exceptions.DatabaseClosed());
                        return;
                    }
                    this.open().catch(nop);
                }
                this._state.dbReadyPromise.then(resolve, reject);
            }).then(fn);
        }
        use({ stack, create, level, name }) {
            if (name)
                this.unuse({ stack, name });
            const middlewares = this._middlewares[stack] || (this._middlewares[stack] = []);
            middlewares.push({ stack, create, level: level == null ? 10 : level, name });
            middlewares.sort((a, b) => a.level - b.level);
            return this;
        }
        unuse({ stack, name, create }) {
            if (stack && this._middlewares[stack]) {
                this._middlewares[stack] = this._middlewares[stack].filter(mw => create ? mw.create !== create :
                    name ? mw.name !== name :
                        false);
            }
            return this;
        }
        open() {
            return dexieOpen(this);
        }
        _close() {
            const state = this._state;
            const idx = connections.indexOf(this);
            if (idx >= 0)
                connections.splice(idx, 1);
            if (this.idbdb) {
                try {
                    this.idbdb.close();
                }
                catch (e) { }
                this._novip.idbdb = null;
            }
            state.dbReadyPromise = new DexiePromise(resolve => {
                state.dbReadyResolve = resolve;
            });
            state.openCanceller = new DexiePromise((_, reject) => {
                state.cancelOpen = reject;
            });
        }
        close() {
            this._close();
            const state = this._state;
            this._options.autoOpen = false;
            state.dbOpenError = new exceptions.DatabaseClosed();
            if (state.isBeingOpened)
                state.cancelOpen(state.dbOpenError);
        }
        delete() {
            const hasArguments = arguments.length > 0;
            const state = this._state;
            return new DexiePromise((resolve, reject) => {
                const doDelete = () => {
                    this.close();
                    var req = this._deps.indexedDB.deleteDatabase(this.name);
                    req.onsuccess = wrap(() => {
                        _onDatabaseDeleted(this._deps, this.name);
                        resolve();
                    });
                    req.onerror = eventRejectHandler(reject);
                    req.onblocked = this._fireOnBlocked;
                };
                if (hasArguments)
                    throw new exceptions.InvalidArgument("Arguments not allowed in db.delete()");
                if (state.isBeingOpened) {
                    state.dbReadyPromise.then(doDelete);
                }
                else {
                    doDelete();
                }
            });
        }
        backendDB() {
            return this.idbdb;
        }
        isOpen() {
            return this.idbdb !== null;
        }
        hasBeenClosed() {
            const dbOpenError = this._state.dbOpenError;
            return dbOpenError && (dbOpenError.name === 'DatabaseClosed');
        }
        hasFailed() {
            return this._state.dbOpenError !== null;
        }
        dynamicallyOpened() {
            return this._state.autoSchema;
        }
        get tables() {
            return keys(this._allTables).map(name => this._allTables[name]);
        }
        transaction() {
            const args = extractTransactionArgs.apply(this, arguments);
            return this._transaction.apply(this, args);
        }
        _transaction(mode, tables, scopeFunc) {
            let parentTransaction = PSD.trans;
            if (!parentTransaction || parentTransaction.db !== this || mode.indexOf('!') !== -1)
                parentTransaction = null;
            const onlyIfCompatible = mode.indexOf('?') !== -1;
            mode = mode.replace('!', '').replace('?', '');
            let idbMode, storeNames;
            try {
                storeNames = tables.map(table => {
                    var storeName = table instanceof this.Table ? table.name : table;
                    if (typeof storeName !== 'string')
                        throw new TypeError("Invalid table argument to Dexie.transaction(). Only Table or String are allowed");
                    return storeName;
                });
                if (mode == "r" || mode === READONLY)
                    idbMode = READONLY;
                else if (mode == "rw" || mode == READWRITE)
                    idbMode = READWRITE;
                else
                    throw new exceptions.InvalidArgument("Invalid transaction mode: " + mode);
                if (parentTransaction) {
                    if (parentTransaction.mode === READONLY && idbMode === READWRITE) {
                        if (onlyIfCompatible) {
                            parentTransaction = null;
                        }
                        else
                            throw new exceptions.SubTransaction("Cannot enter a sub-transaction with READWRITE mode when parent transaction is READONLY");
                    }
                    if (parentTransaction) {
                        storeNames.forEach(storeName => {
                            if (parentTransaction && parentTransaction.storeNames.indexOf(storeName) === -1) {
                                if (onlyIfCompatible) {
                                    parentTransaction = null;
                                }
                                else
                                    throw new exceptions.SubTransaction("Table " + storeName +
                                        " not included in parent transaction.");
                            }
                        });
                    }
                    if (onlyIfCompatible && parentTransaction && !parentTransaction.active) {
                        parentTransaction = null;
                    }
                }
            }
            catch (e) {
                return parentTransaction ?
                    parentTransaction._promise(null, (_, reject) => { reject(e); }) :
                    rejection(e);
            }
            const enterTransaction = enterTransactionScope.bind(null, this, idbMode, storeNames, parentTransaction, scopeFunc);
            return (parentTransaction ?
                parentTransaction._promise(idbMode, enterTransaction, "lock") :
                PSD.trans ?
                    usePSD(PSD.transless, () => this._whenReady(enterTransaction)) :
                    this._whenReady(enterTransaction));
        }
        table(tableName) {
            if (!hasOwn(this._allTables, tableName)) {
                throw new exceptions.InvalidTable(`Table ${tableName} does not exist`);
            }
            return this._allTables[tableName];
        }
    }

    const symbolObservable = typeof Symbol !== "undefined" && "observable" in Symbol
        ? Symbol.observable
        : "@@observable";
    class Observable {
        constructor(subscribe) {
            this._subscribe = subscribe;
        }
        subscribe(x, error, complete) {
            return this._subscribe(!x || typeof x === "function" ? { next: x, error, complete } : x);
        }
        [symbolObservable]() {
            return this;
        }
    }

    function extendObservabilitySet(target, newSet) {
        keys(newSet).forEach(part => {
            const rangeSet = target[part] || (target[part] = new RangeSet());
            mergeRanges(rangeSet, newSet[part]);
        });
        return target;
    }

    let domDeps;
    try {
        domDeps = {
            indexedDB: _global.indexedDB || _global.mozIndexedDB || _global.webkitIndexedDB || _global.msIndexedDB,
            IDBKeyRange: _global.IDBKeyRange || _global.webkitIDBKeyRange
        };
    }
    catch (e) {
        domDeps = { indexedDB: null, IDBKeyRange: null };
    }

    function liveQuery(querier) {
        return new Observable((observer) => {
            const scopeFuncIsAsync = isAsyncFunction(querier);
            function execute(subscr) {
                if (scopeFuncIsAsync) {
                    incrementExpectedAwaits();
                }
                const exec = () => newScope(querier, { subscr, trans: null });
                const rv = PSD.trans
                    ?
                        usePSD(PSD.transless, exec)
                    : exec();
                if (scopeFuncIsAsync) {
                    rv.then(decrementExpectedAwaits, decrementExpectedAwaits);
                }
                return rv;
            }
            let closed = false;
            let accumMuts = {};
            let currentObs = {};
            const subscription = {
                get closed() {
                    return closed;
                },
                unsubscribe: () => {
                    closed = true;
                    globalEvents.storagemutated.unsubscribe(mutationListener);
                },
            };
            observer.start && observer.start(subscription);
            let querying = false, startedListening = false;
            function shouldNotify() {
                return keys(currentObs).some((key) => accumMuts[key] && rangesOverlap(accumMuts[key], currentObs[key]));
            }
            const mutationListener = (parts) => {
                extendObservabilitySet(accumMuts, parts);
                if (shouldNotify()) {
                    doQuery();
                }
            };
            const doQuery = () => {
                if (querying ||
                    closed ||
                    !domDeps.indexedDB)
                 {
                    return;
                }
                accumMuts = {};
                const subscr = {};
                const ret = execute(subscr);
                if (!startedListening) {
                    globalEvents(DEXIE_STORAGE_MUTATED_EVENT_NAME, mutationListener);
                    startedListening = true;
                }
                querying = true;
                Promise.resolve(ret).then((result) => {
                    querying = false;
                    if (closed) {
                        return;
                    }
                    if (shouldNotify()) {
                        doQuery();
                    }
                    else {
                        accumMuts = {};
                        currentObs = subscr;
                        observer.next && observer.next(result);
                    }
                }, (err) => {
                    if (!['DatabaseClosedError', 'AbortError'].includes(err === null || err === void 0 ? void 0 : err.name)) {
                        querying = false;
                        observer.error && observer.error(err);
                        subscription.unsubscribe();
                    }
                });
            };
            doQuery();
            return subscription;
        });
    }

    const Dexie = Dexie$1;
    props(Dexie, {
        ...fullNameExceptions,
        delete(databaseName) {
            const db = new Dexie(databaseName, { addons: [] });
            return db.delete();
        },
        exists(name) {
            return new Dexie(name, { addons: [] }).open().then(db => {
                db.close();
                return true;
            }).catch('NoSuchDatabaseError', () => false);
        },
        getDatabaseNames(cb) {
            try {
                return getDatabaseNames(Dexie.dependencies).then(cb);
            }
            catch (_a) {
                return rejection(new exceptions.MissingAPI());
            }
        },
        defineClass() {
            function Class(content) {
                extend(this, content);
            }
            return Class;
        },
        ignoreTransaction(scopeFunc) {
            return PSD.trans ?
                usePSD(PSD.transless, scopeFunc) :
                scopeFunc();
        },
        vip,
        async: function (generatorFn) {
            return function () {
                try {
                    var rv = awaitIterator(generatorFn.apply(this, arguments));
                    if (!rv || typeof rv.then !== 'function')
                        return DexiePromise.resolve(rv);
                    return rv;
                }
                catch (e) {
                    return rejection(e);
                }
            };
        },
        spawn: function (generatorFn, args, thiz) {
            try {
                var rv = awaitIterator(generatorFn.apply(thiz, args || []));
                if (!rv || typeof rv.then !== 'function')
                    return DexiePromise.resolve(rv);
                return rv;
            }
            catch (e) {
                return rejection(e);
            }
        },
        currentTransaction: {
            get: () => PSD.trans || null
        },
        waitFor: function (promiseOrFunction, optionalTimeout) {
            const promise = DexiePromise.resolve(typeof promiseOrFunction === 'function' ?
                Dexie.ignoreTransaction(promiseOrFunction) :
                promiseOrFunction)
                .timeout(optionalTimeout || 60000);
            return PSD.trans ?
                PSD.trans.waitFor(promise) :
                promise;
        },
        Promise: DexiePromise,
        debug: {
            get: () => debug,
            set: value => {
                setDebug(value, value === 'dexie' ? () => true : dexieStackFrameFilter);
            }
        },
        derive: derive,
        extend: extend,
        props: props,
        override: override,
        Events: Events,
        on: globalEvents,
        liveQuery,
        extendObservabilitySet,
        getByKeyPath: getByKeyPath,
        setByKeyPath: setByKeyPath,
        delByKeyPath: delByKeyPath,
        shallowClone: shallowClone,
        deepClone: deepClone,
        getObjectDiff: getObjectDiff,
        cmp,
        asap: asap$1,
        minKey: minKey,
        addons: [],
        connections: connections,
        errnames: errnames,
        dependencies: domDeps,
        semVer: DEXIE_VERSION,
        version: DEXIE_VERSION.split('.')
            .map(n => parseInt(n))
            .reduce((p, c, i) => p + (c / Math.pow(10, i * 2))),
    });
    Dexie.maxKey = getMaxKey(Dexie.dependencies.IDBKeyRange);

    if (typeof dispatchEvent !== 'undefined' && typeof addEventListener !== 'undefined') {
        globalEvents(DEXIE_STORAGE_MUTATED_EVENT_NAME, updatedParts => {
            if (!propagatingLocally) {
                let event;
                if (isIEOrEdge) {
                    event = document.createEvent('CustomEvent');
                    event.initCustomEvent(STORAGE_MUTATED_DOM_EVENT_NAME, true, true, updatedParts);
                }
                else {
                    event = new CustomEvent(STORAGE_MUTATED_DOM_EVENT_NAME, {
                        detail: updatedParts
                    });
                }
                propagatingLocally = true;
                dispatchEvent(event);
                propagatingLocally = false;
            }
        });
        addEventListener(STORAGE_MUTATED_DOM_EVENT_NAME, ({ detail }) => {
            if (!propagatingLocally) {
                propagateLocally(detail);
            }
        });
    }
    function propagateLocally(updateParts) {
        let wasMe = propagatingLocally;
        try {
            propagatingLocally = true;
            globalEvents.storagemutated.fire(updateParts);
        }
        finally {
            propagatingLocally = wasMe;
        }
    }
    let propagatingLocally = false;

    if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel(STORAGE_MUTATED_DOM_EVENT_NAME);
        if (typeof bc.unref === 'function') {
            bc.unref();
        }
        globalEvents(DEXIE_STORAGE_MUTATED_EVENT_NAME, (changedParts) => {
            if (!propagatingLocally) {
                bc.postMessage(changedParts);
            }
        });
        bc.onmessage = (ev) => {
            if (ev.data)
                propagateLocally(ev.data);
        };
    }
    else if (typeof self !== 'undefined' && typeof navigator !== 'undefined') {
        globalEvents(DEXIE_STORAGE_MUTATED_EVENT_NAME, (changedParts) => {
            try {
                if (!propagatingLocally) {
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem(STORAGE_MUTATED_DOM_EVENT_NAME, JSON.stringify({
                            trig: Math.random(),
                            changedParts,
                        }));
                    }
                    if (typeof self['clients'] === 'object') {
                        [...self['clients'].matchAll({ includeUncontrolled: true })].forEach((client) => client.postMessage({
                            type: STORAGE_MUTATED_DOM_EVENT_NAME,
                            changedParts,
                        }));
                    }
                }
            }
            catch (_a) { }
        });
        if (typeof addEventListener !== 'undefined') {
            addEventListener('storage', (ev) => {
                if (ev.key === STORAGE_MUTATED_DOM_EVENT_NAME) {
                    const data = JSON.parse(ev.newValue);
                    if (data)
                        propagateLocally(data.changedParts);
                }
            });
        }
        const swContainer = self.document && navigator.serviceWorker;
        if (swContainer) {
            swContainer.addEventListener('message', propagateMessageLocally);
        }
    }
    function propagateMessageLocally({ data }) {
        if (data && data.type === STORAGE_MUTATED_DOM_EVENT_NAME) {
            propagateLocally(data.changedParts);
        }
    }

    DexiePromise.rejectionMapper = mapError;
    setDebug(debug, dexieStackFrameFilter);

    class Database extends Dexie$1 {
        articles;
        highlights;
        notes;
        users;
        constructor() {
            super('db');
            this.version(15).stores({
                articles: '++id, url, publisher, content, author, event, title',
                highlights: 'id, url, pubkey, event, content, articleId',
                notes: 'id, url, pubkey, replyToArticleId, replyToEventId, event, content',
                users: '++id, name, displayName, image, banner, bio, nip05, lud16, about, zapService',
            });
        }
    }
    const db = new Database();

    function valueFromTag(event, tag) {
        const matchingTag = event.tags.find((t) => t[0] === tag);
        if (matchingTag)
            return matchingTag[1];
    }
    const HighlightInterface = {
        fromIds: (ids) => {
            return liveQuery(() => db.highlights.where('id').anyOf(ids).toArray());
        },
        load: (opts = {}) => {
            const filter = { kinds: [9801] };
            if (opts.pubkeys)
                filter['authors'] = opts.pubkeys;
            let articleReference;
            if (opts.articleNaddr) {
                const ndecode = nip19_exports.decode(opts.articleNaddr).data;
                articleReference = `${ndecode.kind}:${ndecode.pubkey}:${ndecode.identifier}`;
                filter['#a'] = [articleReference];
            }
            if (opts.url)
                filter['#r'] = [opts.url];
            console.log({ filter });
            const ndk$1 = get_store_value(ndk);
            const subs = ndk$1.subscribe(filter);
            subs.on('event', async (event) => {
                const url = valueFromTag(event, 'r');
                if (!url)
                    return;
                try {
                    const articleId = valueFromTag(event, 'a');
                    const highlight = {
                        id: event.tagId(),
                        url,
                        pubkey: event.pubkey,
                        content: event.content,
                        articleId,
                        event: JSON.stringify(await event.toNostrEvent())
                    };
                    await db.highlights.put(highlight);
                }
                catch (e) {
                    console.error(e);
                }
            });
            if (opts.pubkeys) {
                return liveQuery(() => db.highlights.where('pubkey').anyOf(opts.pubkeys).toArray());
            }
            else if (articleReference) {
                return liveQuery(() => db.highlights.where({ articleId: articleReference }).toArray());
            }
            else if (opts.url) {
                return liveQuery(() => db.highlights.where({ url: opts.url }).toArray());
            }
            else {
                return liveQuery(() => (db.highlights.toArray()));
            }
        }
    };

    function flattenText(node) {
        const texts = [];
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
        while (walker.nextNode()) {
            texts.push(walker.currentNode);
        }
        return texts;
    }
    function highlightText(targetText) {
        const regex = new RegExp(escapeRegExp(targetText), 'g');
        const textNodes = flattenText(document.body);
        const marks = [];
        textNodes.forEach((textNode) => {
            let match;
            let lastIndex = 0;
            while ((match = regex.exec(textNode.data)) !== null) {
                const mark = document.createElement('mark');
                const range = document.createRange();
                const startOffset = match.index;
                const endOffset = startOffset + targetText.length;
                if (lastIndex < startOffset) {
                    const precedingTextNode = document.createTextNode(textNode.data.slice(lastIndex, startOffset));
                    textNode.parentNode.insertBefore(precedingTextNode, textNode);
                }
                range.setStart(textNode, startOffset);
                range.setEnd(textNode, endOffset);
                range.surroundContents(mark);
                marks.push(mark);
                lastIndex = endOffset;
            }
            if (lastIndex < textNode.length) {
                const remainingTextNode = document.createTextNode(textNode.data.slice(lastIndex));
                textNode.parentNode.insertBefore(remainingTextNode, textNode);
            }
            textNode.remove();
        });
        return marks;
        function escapeRegExp(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
        }
    }
    // Usage example: highlightText("your target text here");
    // export function modifyDocument(content: string) {
    //     const regex = new RegExp(content, 'gi');
    //     // get all the text nodes in the current page
    //     const textNodes = document.evaluate("//text()", document, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
    //     // loop through all the text nodes and replace the search string with the marked up version
    //     for (let i = 0; i < textNodes.snapshotLength; i++) {
    //         const node = textNodes.snapshotItem(i) as Text;
    //         const parent = node.parentNode;
    //         // check if the text node contains the search string
    //         if (!node || !node.textContent || !node.textContent.match(regex)) {
    //             continue;
    //         }
    //         const fragment = document.createDocumentFragment();
    //         let match;
    //         if (!node) continue;
    //         // loop through all the matches in the text node
    //         while ((match = regex.exec(node.textContent)) !== null) {
    //             console.log({match, node});
    //             const before = node.splitText(match.index);
    //             const after = node.splitText(match[0].length);
    //             console.log({before, after});
    //             const mark = document.createElement("mark");
    //             // append the matched text to the mark element
    //             mark.appendChild(document.createTextNode(match[0]));
    //             // append the mark element to the document fragment
    //             fragment.appendChild(before);
    //             fragment.appendChild(mark);
    //             node = after;
    //         }
    //         // replace the original text node with the marked up version
    //         parent.replaceChild(fragment, node);
    //     }
    // }

    /* src/Widget.svelte generated by Svelte v3.58.0 */

    function create_else_block(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("📝");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (52:12) {#if $highlights?.length > 0}
    function create_if_block(ctx) {
    	let t_value = /*$highlights*/ ctx[0]?.length + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$highlights*/ 1 && t_value !== (t_value = /*$highlights*/ ctx[0]?.length + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let div2;
    	let div0;
    	let a;
    	let t;
    	let div1;
    	let container;
    	let div1_class_value;
    	let current;
    	let mounted;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (/*$highlights*/ ctx[0]?.length > 0) return create_if_block;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);
    	container = new Container({});

    	return {
    		c() {
    			div2 = element("div");
    			div0 = element("div");
    			a = element("a");
    			if_block.c();
    			t = space();
    			div1 = element("div");
    			create_component(container.$$.fragment);
    			attr(a, "href", "#");
    			attr(a, "class", "text-white bg-purple-900 hover:bg-purple-700 w-16 h-16 p-5 rounded-full text-center flex flex-row items-center justify-center gap-4 text-xl font-black  svelte-wpu8if");
    			attr(div0, "class", "self-end svelte-wpu8if");
    			attr(div1, "class", div1_class_value = "shadow-2xl bg-white/90 backdrop-brightness-150 backdrop-blur-md mb-5 w-96 max-w-screen-sm text-black rounded-3xl p-5 overflow-auto flex flex-col justify-end " + (/*minimizeChat*/ ctx[1] ? 'hidden' : '') + "" + " svelte-wpu8if");
    			set_style(div1, "max-height", "80vh");
    			attr(div2, "class", "fixed top-5 right-5 mb-5 flex flex-col item-end font-sans  svelte-wpu8if");
    			set_style(div2, "z-index", "9999999");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div0);
    			append(div0, a);
    			if_block.m(a, null);
    			append(div2, t);
    			append(div2, div1);
    			mount_component(container, div1, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen(a, "click", prevent_default(/*toggleChat*/ ctx[3]));
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(a, null);
    				}
    			}

    			if (!current || dirty & /*minimizeChat*/ 2 && div1_class_value !== (div1_class_value = "shadow-2xl bg-white/90 backdrop-brightness-150 backdrop-blur-md mb-5 w-96 max-w-screen-sm text-black rounded-3xl p-5 overflow-auto flex flex-col justify-end " + (/*minimizeChat*/ ctx[1] ? 'hidden' : '') + "" + " svelte-wpu8if")) {
    				attr(div1, "class", div1_class_value);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(container.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(container.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
    			if_block.d();
    			destroy_component(container);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let $highlights,
    		$$unsubscribe_highlights = noop,
    		$$subscribe_highlights = () => ($$unsubscribe_highlights(), $$unsubscribe_highlights = subscribe(highlights, $$value => $$invalidate(0, $highlights = $$value)), highlights);

    	let $ndk;
    	component_subscribe($$self, ndk, $$value => $$invalidate(5, $ndk = $$value));
    	$$self.$$.on_destroy.push(() => $$unsubscribe_highlights());
    	let minimizeChat = true;
    	let highlights;
    	let replacedHighlights = {};

    	onMount(async () => {
    		try {
    			set_store_value(ndk, $ndk.signer = new NDKNip07Signer(), $ndk);
    		} catch(e) {
    			console.error(e);
    		}

    		await $ndk.connect();
    		const url = new URL(window.location.href);
    		$$subscribe_highlights($$invalidate(2, highlights = HighlightInterface.load({ url: url.href })));
    	});

    	function toggleChat() {
    		$$invalidate(1, minimizeChat = !minimizeChat);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$highlights, replacedHighlights*/ 17) {
    			{
    				if ($highlights && $highlights.length > 0) {
    					for (const highlight of $highlights) {
    						if (replacedHighlights[highlight.id]) continue;
    						console.log(highlight.id, highlight.content);

    						try {
    							$$invalidate(4, replacedHighlights[highlight.id] = true, replacedHighlights);
    							highlightText(highlight.content);
    						} catch(e) {
    							console.error(e);
    							continue;
    						}
    					}
    				}
    			}
    		}
    	};

    	return [$highlights, minimizeChat, highlights, toggleChat, replacedHighlights];
    }

    class Widget extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    var div = document.createElement('DIV');
    // var script = document.currentScript;
    let relays; // = script.getAttribute('data-relays');
    // script.parentNode.insertBefore(div, script);
    document.body.appendChild(div);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'http://localhost:5173/public/bundle.css';
    // Append the link element to the head of the page
    document.head.appendChild(link);
    if (!relays) {
        relays = 'wss://relay.f7z.io,wss://nos.lol,wss://relay.nostr.info,wss://nostr-pub.wellorder.net,wss://relay.current.fyi,wss://relay.nostr.band';
    }
    relays = relays.split(',');
    new Widget({
        target: div,
        props: {
            relays
        },
    });

})();
//# sourceMappingURL=bundle.js.map
