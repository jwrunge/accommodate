
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop() {}

    const identity = x => x;

    function assign(tar, src) {
      // @ts-ignore
      for (const k in src) tar[k] = src[k];

      return tar;
    }

    function is_promise(value) {
      return value && typeof value === 'object' && typeof value.then === 'function';
    }

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
      return a != a ? b == b : a !== b || a && typeof a === 'object' || typeof a === 'function';
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

    function component_subscribe(component, store, callback) {
      component.$$.on_destroy.push(subscribe(store, callback));
    }

    function create_slot(definition, ctx, $$scope, fn) {
      if (definition) {
        const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
        return definition[0](slot_ctx);
      }
    }

    function get_slot_context(definition, ctx, $$scope, fn) {
      return definition[1] && fn ? assign($$scope.ctx.slice(), definition[1](fn(ctx))) : $$scope.ctx;
    }

    function get_slot_changes(definition, $$scope, dirty, fn) {
      if (definition[2] && fn) {
        const lets = definition[2](fn(dirty));

        if ($$scope.dirty === undefined) {
          return lets;
        }

        if (typeof lets === 'object') {
          const merged = [];
          const len = Math.max($$scope.dirty.length, lets.length);

          for (let i = 0; i < len; i += 1) {
            merged[i] = $$scope.dirty[i] | lets[i];
          }

          return merged;
        }

        return $$scope.dirty | lets;
      }

      return $$scope.dirty;
    }

    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
      const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);

      if (slot_changes) {
        const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
        slot.p(slot_context, slot_changes);
      }
    }

    function set_store_value(store, ret, value = ret) {
      store.set(value);
      return ret;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client ? () => window.performance.now() : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop; // used internally for testing

    const tasks = new Set();

    function run_tasks(now) {
      tasks.forEach(task => {
        if (!task.c(now)) {
          tasks.delete(task);
          task.f();
        }
      });
      if (tasks.size !== 0) raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */


    function loop(callback) {
      let task;
      if (tasks.size === 0) raf(run_tasks);
      return {
        promise: new Promise(fulfill => {
          tasks.add(task = {
            c: callback,
            f: fulfill
          });
        }),

        abort() {
          tasks.delete(task);
        }

      };
    } // Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
    // at the end of hydration without touching the remaining nodes.


    let is_hydrating = false;

    function start_hydrating() {
      is_hydrating = true;
    }

    function end_hydrating() {
      is_hydrating = false;
    }

    function upper_bound(low, high, key, value) {
      // Return first index of value larger than input value in the range [low, high)
      while (low < high) {
        const mid = low + (high - low >> 1);

        if (key(mid) <= value) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }

      return low;
    }

    function init_hydrate(target) {
      if (target.hydrate_init) return;
      target.hydrate_init = true; // We know that all children have claim_order values since the unclaimed have been detached

      const children = target.childNodes;
      /*
      * Reorder claimed children optimally.
      * We can reorder claimed children optimally by finding the longest subsequence of
      * nodes that are already claimed in order and only moving the rest. The longest
      * subsequence subsequence of nodes that are claimed in order can be found by
      * computing the longest increasing subsequence of .claim_order values.
      *
      * This algorithm is optimal in generating the least amount of reorder operations
      * possible.
      *
      * Proof:
      * We know that, given a set of reordering operations, the nodes that do not move
      * always form an increasing subsequence, since they do not move among each other
      * meaning that they must be already ordered among each other. Thus, the maximal
      * set of nodes that do not move form a longest increasing subsequence.
      */
      // Compute longest increasing subsequence
      // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j

      const m = new Int32Array(children.length + 1); // Predecessor indices + 1

      const p = new Int32Array(children.length);
      m[0] = -1;
      let longest = 0;

      for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order; // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one

        const seqLen = upper_bound(1, longest + 1, idx => children[m[idx]].claim_order, current) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1; // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.

        m[newLen] = i;
        longest = Math.max(newLen, longest);
      } // The longest increasing subsequence of nodes (initially reversed)


      const lis = []; // The rest of the nodes, nodes that will be moved

      const toMove = [];
      let last = children.length - 1;

      for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);

        for (; last >= cur; last--) {
          toMove.push(children[last]);
        }

        last--;
      }

      for (; last >= 0; last--) {
        toMove.push(children[last]);
      }

      lis.reverse(); // We sort the nodes being moved to guarantee that their insertion order matches the claim order

      toMove.sort((a, b) => a.claim_order - b.claim_order); // Finally, we move the nodes

      for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
          j++;
        }

        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
      }
    }

    function append(target, node) {
      if (is_hydrating) {
        init_hydrate(target);

        if (target.actual_end_child === undefined || target.actual_end_child !== null && target.actual_end_child.parentElement !== target) {
          target.actual_end_child = target.firstChild;
        }

        if (node !== target.actual_end_child) {
          target.insertBefore(node, target.actual_end_child);
        } else {
          target.actual_end_child = node.nextSibling;
        }
      } else if (node.parentNode !== target) {
        target.appendChild(node);
      }
    }

    function insert(target, node, anchor) {
      if (is_hydrating && !anchor) {
        append(target, node);
      } else if (node.parentNode !== target || anchor && node.nextSibling !== anchor) {
        target.insertBefore(node, anchor || null);
      }
    }

    function detach(node) {
      node.parentNode.removeChild(node);
    }

    function destroy_each(iterations, detaching) {
      for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i]) iterations[i].d(detaching);
      }
    }

    function element(name) {
      return document.createElement(name);
    }

    function svg_element(name) {
      return document.createElementNS('http://www.w3.org/2000/svg', name);
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
        event.preventDefault(); // @ts-ignore

        return fn.call(this, event);
      };
    }

    function stop_propagation(fn) {
      return function (event) {
        event.stopPropagation(); // @ts-ignore

        return fn.call(this, event);
      };
    }

    function attr(node, attribute, value) {
      if (value == null) node.removeAttribute(attribute);else if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
    }

    function children(element) {
      return Array.from(element.childNodes);
    }

    function set_data(text, data) {
      data = '' + data;
      if (text.wholeText !== data) text.data = data;
    }

    function set_input_value(input, value) {
      input.value = value == null ? '' : value;
    }

    function set_style(node, key, value, important) {
      node.style.setProperty(key, value, important ? 'important' : '');
    }

    function toggle_class(element, name, toggle) {
      element.classList[toggle ? 'add' : 'remove'](name);
    }

    function custom_event(type, detail) {
      const e = document.createEvent('CustomEvent');
      e.initCustomEvent(type, false, false, detail);
      return e;
    }

    const active_docs = new Set();
    let active = 0; // https://github.com/darkskyapp/string-hash/blob/master/index.js

    function hash(str) {
      let hash = 5381;
      let i = str.length;

      while (i--) hash = (hash << 5) - hash ^ str.charCodeAt(i);

      return hash >>> 0;
    }

    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
      const step = 16.666 / duration;
      let keyframes = '{\n';

      for (let p = 0; p <= 1; p += step) {
        const t = a + (b - a) * ease(p);
        keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
      }

      const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
      const name = `__svelte_${hash(rule)}_${uid}`;
      const doc = node.ownerDocument;
      active_docs.add(doc);
      const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
      const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});

      if (!current_rules[name]) {
        current_rules[name] = true;
        stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
      }

      const animation = node.style.animation || '';
      node.style.animation = `${animation ? `${animation}, ` : ''}${name} ${duration}ms linear ${delay}ms 1 both`;
      active += 1;
      return name;
    }

    function delete_rule(node, name) {
      const previous = (node.style.animation || '').split(', ');
      const next = previous.filter(name ? anim => anim.indexOf(name) < 0 // remove specific animation
      : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
      );
      const deleted = previous.length - next.length;

      if (deleted) {
        node.style.animation = next.join(', ');
        active -= deleted;
        if (!active) clear_rules();
      }
    }

    function clear_rules() {
      raf(() => {
        if (active) return;
        active_docs.forEach(doc => {
          const stylesheet = doc.__svelte_stylesheet;
          let i = stylesheet.cssRules.length;

          while (i--) stylesheet.deleteRule(i);

          doc.__svelte_rules = {};
        });
        active_docs.clear();
      });
    }

    function create_animation(node, from, fn, params) {
      if (!from) return noop;
      const to = node.getBoundingClientRect();
      if (from.left === to.left && from.right === to.right && from.top === to.top && from.bottom === to.bottom) return noop;
      const {
        delay = 0,
        duration = 300,
        easing = identity,
        // @ts-ignore todo: should this be separated from destructuring? Or start/end added to public api and documentation?
        start: start_time = now() + delay,
        // @ts-ignore todo:
        end = start_time + duration,
        tick = noop,
        css
      } = fn(node, {
        from,
        to
      }, params);
      let running = true;
      let started = false;
      let name;

      function start() {
        if (css) {
          name = create_rule(node, 0, 1, duration, delay, easing, css);
        }

        if (!delay) {
          started = true;
        }
      }

      function stop() {
        if (css) delete_rule(node, name);
        running = false;
      }

      loop(now => {
        if (!started && now >= start_time) {
          started = true;
        }

        if (started && now >= end) {
          tick(1, 0);
          stop();
        }

        if (!running) {
          return false;
        }

        if (started) {
          const p = now - start_time;
          const t = 0 + 1 * easing(p / duration);
          tick(t, 1 - t);
        }

        return true;
      });
      start();
      tick(0, 1);
      return stop;
    }

    function fix_position(node) {
      const style = getComputedStyle(node);

      if (style.position !== 'absolute' && style.position !== 'fixed') {
        const {
          width,
          height
        } = style;
        const a = node.getBoundingClientRect();
        node.style.position = 'absolute';
        node.style.width = width;
        node.style.height = height;
        add_transform(node, a);
      }
    }

    function add_transform(node, a) {
      const b = node.getBoundingClientRect();

      if (a.left !== b.left || a.top !== b.top) {
        const style = getComputedStyle(node);
        const transform = style.transform === 'none' ? '' : style.transform;
        node.style.transform = `${transform} translate(${a.left - b.left}px, ${a.top - b.top}px)`;
      }
    }

    let current_component;

    function set_current_component(component) {
      current_component = component;
    }

    function get_current_component() {
      if (!current_component) throw new Error('Function called outside component initialization');
      return current_component;
    }

    function onMount(fn) {
      get_current_component().$$.on_mount.push(fn);
    }

    function onDestroy(fn) {
      get_current_component().$$.on_destroy.push(fn);
    }

    function createEventDispatcher() {
      const component = get_current_component();
      return (type, detail) => {
        const callbacks = component.$$.callbacks[type];

        if (callbacks) {
          // TODO are there situations where events could be dispatched
          // in a server (non-DOM) environment?
          const event = custom_event(type, detail);
          callbacks.slice().forEach(fn => {
            fn.call(component, event);
          });
        }
      };
    }
    // shorthand events, or if we want to implement
    // a real bubbling mechanism


    function bubble(component, event) {
      const callbacks = component.$$.callbacks[event.type];

      if (callbacks) {
        // @ts-ignore
        callbacks.slice().forEach(fn => fn.call(this, event));
      }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;

    function schedule_update() {
      if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
      }
    }

    function tick() {
      schedule_update();
      return resolved_promise;
    }

    function add_render_callback(fn) {
      render_callbacks.push(fn);
    }

    function add_flush_callback(fn) {
      flush_callbacks.push(fn);
    }

    let flushing = false;
    const seen_callbacks = new Set();

    function flush() {
      if (flushing) return;
      flushing = true;

      do {
        // first, call beforeUpdate functions
        // and update components
        for (let i = 0; i < dirty_components.length; i += 1) {
          const component = dirty_components[i];
          set_current_component(component);
          update(component.$$);
        }

        set_current_component(null);
        dirty_components.length = 0;

        while (binding_callbacks.length) binding_callbacks.pop()(); // then, once components are updated, call
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
      flushing = false;
      seen_callbacks.clear();
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

    let promise;

    function wait() {
      if (!promise) {
        promise = Promise.resolve();
        promise.then(() => {
          promise = null;
        });
      }

      return promise;
    }

    function dispatch(node, direction, kind) {
      node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
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
        if (outroing.has(block)) return;
        outroing.add(block);
        outros.c.push(() => {
          outroing.delete(block);

          if (callback) {
            if (detach) block.d(1);
            callback();
          }
        });
        block.o(local);
      }
    }

    const null_transition = {
      duration: 0
    };

    function create_in_transition(node, fn, params) {
      let config = fn(node, params);
      let running = false;
      let animation_name;
      let task;
      let uid = 0;

      function cleanup() {
        if (animation_name) delete_rule(node, animation_name);
      }

      function go() {
        const {
          delay = 0,
          duration = 300,
          easing = identity,
          tick = noop,
          css
        } = config || null_transition;
        if (css) animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
        tick(0, 1);
        const start_time = now() + delay;
        const end_time = start_time + duration;
        if (task) task.abort();
        running = true;
        add_render_callback(() => dispatch(node, true, 'start'));
        task = loop(now => {
          if (running) {
            if (now >= end_time) {
              tick(1, 0);
              dispatch(node, true, 'end');
              cleanup();
              return running = false;
            }

            if (now >= start_time) {
              const t = easing((now - start_time) / duration);
              tick(t, 1 - t);
            }
          }

          return running;
        });
      }

      let started = false;
      return {
        start() {
          if (started) return;
          delete_rule(node);

          if (is_function(config)) {
            config = config();
            wait().then(go);
          } else {
            go();
          }
        },

        invalidate() {
          started = false;
        },

        end() {
          if (running) {
            cleanup();
            running = false;
          }
        }

      };
    }

    function create_out_transition(node, fn, params) {
      let config = fn(node, params);
      let running = true;
      let animation_name;
      const group = outros;
      group.r += 1;

      function go() {
        const {
          delay = 0,
          duration = 300,
          easing = identity,
          tick = noop,
          css
        } = config || null_transition;
        if (css) animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
        const start_time = now() + delay;
        const end_time = start_time + duration;
        add_render_callback(() => dispatch(node, false, 'start'));
        loop(now => {
          if (running) {
            if (now >= end_time) {
              tick(0, 1);
              dispatch(node, false, 'end');

              if (! --group.r) {
                // this will result in `end()` being called,
                // so we don't need to clean up here
                run_all(group.c);
              }

              return false;
            }

            if (now >= start_time) {
              const t = easing((now - start_time) / duration);
              tick(1 - t, t);
            }
          }

          return running;
        });
      }

      if (is_function(config)) {
        wait().then(() => {
          // @ts-ignore
          config = config();
          go();
        });
      } else {
        go();
      }

      return {
        end(reset) {
          if (reset && config.tick) {
            config.tick(1, 0);
          }

          if (running) {
            if (animation_name) delete_rule(node, animation_name);
            running = false;
          }
        }

      };
    }

    function create_bidirectional_transition(node, fn, params, intro) {
      let config = fn(node, params);
      let t = intro ? 0 : 1;
      let running_program = null;
      let pending_program = null;
      let animation_name = null;

      function clear_animation() {
        if (animation_name) delete_rule(node, animation_name);
      }

      function init(program, duration) {
        const d = program.b - t;
        duration *= Math.abs(d);
        return {
          a: t,
          b: program.b,
          d,
          duration,
          start: program.start,
          end: program.start + duration,
          group: program.group
        };
      }

      function go(b) {
        const {
          delay = 0,
          duration = 300,
          easing = identity,
          tick = noop,
          css
        } = config || null_transition;
        const program = {
          start: now() + delay,
          b
        };

        if (!b) {
          // @ts-ignore todo: improve typings
          program.group = outros;
          outros.r += 1;
        }

        if (running_program || pending_program) {
          pending_program = program;
        } else {
          // if this is an intro, and there's a delay, we need to do
          // an initial tick and/or apply CSS animation immediately
          if (css) {
            clear_animation();
            animation_name = create_rule(node, t, b, duration, delay, easing, css);
          }

          if (b) tick(0, 1);
          running_program = init(program, duration);
          add_render_callback(() => dispatch(node, b, 'start'));
          loop(now => {
            if (pending_program && now > pending_program.start) {
              running_program = init(pending_program, duration);
              pending_program = null;
              dispatch(node, running_program.b, 'start');

              if (css) {
                clear_animation();
                animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
              }
            }

            if (running_program) {
              if (now >= running_program.end) {
                tick(t = running_program.b, 1 - t);
                dispatch(node, running_program.b, 'end');

                if (!pending_program) {
                  // we're done
                  if (running_program.b) {
                    // intro — we can tidy up immediately
                    clear_animation();
                  } else {
                    // outro — needs to be coordinated
                    if (! --running_program.group.r) run_all(running_program.group.c);
                  }
                }

                running_program = null;
              } else if (now >= running_program.start) {
                const p = now - running_program.start;
                t = running_program.a + running_program.d * easing(p / running_program.duration);
                tick(t, 1 - t);
              }
            }

            return !!(running_program || pending_program);
          });
        }
      }

      return {
        run(b) {
          if (is_function(config)) {
            wait().then(() => {
              // @ts-ignore
              config = config();
              go(b);
            });
          } else {
            go(b);
          }
        },

        end() {
          clear_animation();
          running_program = pending_program = null;
        }

      };
    }

    function handle_promise(promise, info) {
      const token = info.token = {};

      function update(type, index, key, value) {
        if (info.token !== token) return;
        info.resolved = value;
        let child_ctx = info.ctx;

        if (key !== undefined) {
          child_ctx = child_ctx.slice();
          child_ctx[key] = value;
        }

        const block = type && (info.current = type)(child_ctx);
        let needs_flush = false;

        if (info.block) {
          if (info.blocks) {
            info.blocks.forEach((block, i) => {
              if (i !== index && block) {
                group_outros();
                transition_out(block, 1, 1, () => {
                  if (info.blocks[i] === block) {
                    info.blocks[i] = null;
                  }
                });
                check_outros();
              }
            });
          } else {
            info.block.d(1);
          }

          block.c();
          transition_in(block, 1);
          block.m(info.mount(), info.anchor);
          needs_flush = true;
        }

        info.block = block;
        if (info.blocks) info.blocks[index] = block;

        if (needs_flush) {
          flush();
        }
      }

      if (is_promise(promise)) {
        const current_component = get_current_component();
        promise.then(value => {
          set_current_component(current_component);
          update(info.then, 1, info.value, value);
          set_current_component(null);
        }, error => {
          set_current_component(current_component);
          update(info.catch, 2, info.error, error);
          set_current_component(null);

          if (!info.hasCatch) {
            throw error;
          }
        }); // if we previously had a then/catch block, destroy it

        if (info.current !== info.pending) {
          update(info.pending, 0);
          return true;
        }
      } else {
        if (info.current !== info.then) {
          update(info.then, 1, info.value, promise);
          return true;
        }

        info.resolved = promise;
      }
    }

    function update_await_block_branch(info, ctx, dirty) {
      const child_ctx = ctx.slice();
      const {
        resolved
      } = info;

      if (info.current === info.then) {
        child_ctx[info.value] = resolved;
      }

      if (info.current === info.catch) {
        child_ctx[info.error] = resolved;
      }

      info.block.p(child_ctx, dirty);
    }

    const globals = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : global;

    function outro_and_destroy_block(block, lookup) {
      transition_out(block, 1, 1, () => {
        lookup.delete(block.key);
      });
    }

    function fix_and_outro_and_destroy_block(block, lookup) {
      block.f();
      outro_and_destroy_block(block, lookup);
    }

    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
      let o = old_blocks.length;
      let n = list.length;
      let i = o;
      const old_indexes = {};

      while (i--) old_indexes[old_blocks[i].key] = i;

      const new_blocks = [];
      const new_lookup = new Map();
      const deltas = new Map();
      i = n;

      while (i--) {
        const child_ctx = get_context(ctx, list, i);
        const key = get_key(child_ctx);
        let block = lookup.get(key);

        if (!block) {
          block = create_each_block(key, child_ctx);
          block.c();
        } else if (dynamic) {
          block.p(child_ctx, dirty);
        }

        new_lookup.set(key, new_blocks[i] = block);
        if (key in old_indexes) deltas.set(key, Math.abs(i - old_indexes[key]));
      }

      const will_move = new Set();
      const did_move = new Set();

      function insert(block) {
        transition_in(block, 1);
        block.m(node, next);
        lookup.set(block.key, block);
        next = block.first;
        n--;
      }

      while (o && n) {
        const new_block = new_blocks[n - 1];
        const old_block = old_blocks[o - 1];
        const new_key = new_block.key;
        const old_key = old_block.key;

        if (new_block === old_block) {
          // do nothing
          next = new_block.first;
          o--;
          n--;
        } else if (!new_lookup.has(old_key)) {
          // remove old block
          destroy(old_block, lookup);
          o--;
        } else if (!lookup.has(new_key) || will_move.has(new_key)) {
          insert(new_block);
        } else if (did_move.has(old_key)) {
          o--;
        } else if (deltas.get(new_key) > deltas.get(old_key)) {
          did_move.add(new_key);
          insert(new_block);
        } else {
          will_move.add(old_key);
          o--;
        }
      }

      while (o--) {
        const old_block = old_blocks[o];
        if (!new_lookup.has(old_block.key)) destroy(old_block, lookup);
      }

      while (n) insert(new_blocks[n - 1]);

      return new_blocks;
    }

    function bind(component, name, callback) {
      const index = component.$$.props[name];

      if (index !== undefined) {
        component.$$.bound[index] = callback;
        callback(component.$$.ctx[index]);
      }
    }

    function create_component(block) {
      block && block.c();
    }

    function mount_component(component, target, anchor, customElement) {
      const {
        fragment,
        on_mount,
        on_destroy,
        after_update
      } = component.$$;
      fragment && fragment.m(target, anchor);

      if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
          const new_on_destroy = on_mount.map(run).filter(is_function);

          if (on_destroy) {
            on_destroy.push(...new_on_destroy);
          } else {
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
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching); // TODO null out other refs, including component.$$ (but need to
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

      component.$$.dirty[i / 31 | 0] |= 1 << i % 31;
    }

    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
      const parent_component = current_component;
      set_current_component(component);
      const $$ = component.$$ = {
        fragment: null,
        ctx: null,
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
        context: new Map(parent_component ? parent_component.$$.context : options.context || []),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false
      };
      let ready = false;
      $$.ctx = instance ? instance(component, options.props || {}, (i, ret, ...rest) => {
        const value = rest.length ? rest[0] : ret;

        if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
          if (!$$.skip_bound && $$.bound[i]) $$.bound[i](value);
          if (ready) make_dirty(component, i);
        }

        return ret;
      }) : [];
      $$.update();
      ready = true;
      run_all($$.before_update); // `false` as a special case of no DOM component

      $$.fragment = create_fragment ? create_fragment($$.ctx) : false;

      if (options.target) {
        if (options.hydrate) {
          start_hydrating();
          const nodes = children(options.target); // eslint-disable-next-line @typescript-eslint/no-non-null-assertion

          $$.fragment && $$.fragment.l(nodes);
          nodes.forEach(detach);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          $$.fragment && $$.fragment.c();
        }

        if (options.intro) transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
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
        const callbacks = this.$$.callbacks[type] || (this.$$.callbacks[type] = []);
        callbacks.push(callback);
        return () => {
          const index = callbacks.indexOf(callback);
          if (index !== -1) callbacks.splice(index, 1);
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

    function _defineProperty(obj, key, value) {
      if (key in obj) {
        Object.defineProperty(obj, key, {
          value: value,
          enumerable: true,
          configurable: true,
          writable: true
        });
      } else {
        obj[key] = value;
      }

      return obj;
    }

    function cubicOut(t) {
      const f = t - 1.0;
      return f * f * f + 1.0;
    }

    function quintOut(t) {
      return --t * t * t * t * t + 1;
    }

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */

    function __rest(s, e) {
      var t = {};

      for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0) t[p] = s[p];

      if (s != null && typeof Object.getOwnPropertySymbols === "function") for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
        if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i])) t[p[i]] = s[p[i]];
      }
      return t;
    }

    function fade(node, {
      delay = 0,
      duration = 400,
      easing = identity
    } = {}) {
      const o = +getComputedStyle(node).opacity;
      return {
        delay,
        duration,
        easing,
        css: t => `opacity: ${t * o}`
      };
    }

    function fly(node, {
      delay = 0,
      duration = 400,
      easing = cubicOut,
      x = 0,
      y = 0,
      opacity = 0
    } = {}) {
      const style = getComputedStyle(node);
      const target_opacity = +style.opacity;
      const transform = style.transform === 'none' ? '' : style.transform;
      const od = target_opacity * (1 - opacity);
      return {
        delay,
        duration,
        easing,
        css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - od * u}`
      };
    }

    function scale(node, {
      delay = 0,
      duration = 400,
      easing = cubicOut,
      start = 0,
      opacity = 0
    } = {}) {
      const style = getComputedStyle(node);
      const target_opacity = +style.opacity;
      const transform = style.transform === 'none' ? '' : style.transform;
      const sd = 1 - start;
      const od = target_opacity * (1 - opacity);
      return {
        delay,
        duration,
        easing,
        css: (_t, u) => `
			transform: ${transform} scale(${1 - sd * u});
			opacity: ${target_opacity - od * u}
		`
      };
    }

    function crossfade(_a) {
      var {
        fallback
      } = _a,
          defaults = __rest(_a, ["fallback"]);

      const to_receive = new Map();
      const to_send = new Map();

      function crossfade(from, node, params) {
        const {
          delay = 0,
          duration = d => Math.sqrt(d) * 30,
          easing = cubicOut
        } = assign(assign({}, defaults), params);
        const to = node.getBoundingClientRect();
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        const dw = from.width / to.width;
        const dh = from.height / to.height;
        const d = Math.sqrt(dx * dx + dy * dy);
        const style = getComputedStyle(node);
        const transform = style.transform === 'none' ? '' : style.transform;
        const opacity = +style.opacity;
        return {
          delay,
          duration: is_function(duration) ? duration(d) : duration,
          easing,
          css: (t, u) => `
				opacity: ${t * opacity};
				transform-origin: top left;
				transform: ${transform} translate(${u * dx}px,${u * dy}px) scale(${t + (1 - t) * dw}, ${t + (1 - t) * dh});
			`
        };
      }

      function transition(items, counterparts, intro) {
        return (node, params) => {
          items.set(params.key, {
            rect: node.getBoundingClientRect()
          });
          return () => {
            if (counterparts.has(params.key)) {
              const {
                rect
              } = counterparts.get(params.key);
              counterparts.delete(params.key);
              return crossfade(rect, node, params);
            } // if the node is disappearing altogether
            // (i.e. wasn't claimed by the other list)
            // then we need to supply an outro


            items.delete(params.key);
            return fallback && fallback(node, params, intro);
          };
        };
      }

      return [transition(to_send, to_receive, false), transition(to_receive, to_send, true)];
    }

    function flip(node, animation, params = {}) {
      const style = getComputedStyle(node);
      const transform = style.transform === 'none' ? '' : style.transform;
      const scaleX = animation.from.width / node.clientWidth;
      const scaleY = animation.from.height / node.clientHeight;
      const dx = (animation.from.left - animation.to.left) / scaleX;
      const dy = (animation.from.top - animation.to.top) / scaleY;
      const d = Math.sqrt(dx * dx + dy * dy);
      const {
        delay = 0,
        duration = d => Math.sqrt(d) * 120,
        easing = cubicOut
      } = params;
      return {
        delay,
        duration: is_function(duration) ? duration(d) : duration,
        easing,
        css: (_t, u) => `transform: ${transform} translate(${u * dx}px, ${u * dy}px);`
      };
    }

    /* node_modules\svelte-sortable-list\SortableList.svelte generated by Svelte v3.38.3 */

    function get_each_context(ctx, list, i) {
      const child_ctx = ctx.slice();
      child_ctx[15] = list[i];
      child_ctx[17] = i;
      return child_ctx;
    }

    const get_default_slot_changes = dirty => ({
      item: dirty &
      /*list*/
      1,
      index: dirty &
      /*list*/
      1
    });

    const get_default_slot_context = ctx => ({
      item:
      /*item*/
      ctx[15],
      index:
      /*index*/
      ctx[17]
    }); // (82:0) {#if list && list.length}


    function create_if_block(ctx) {
      let ul;
      let each_blocks = [];
      let each_1_lookup = new Map();
      let current;
      let each_value =
      /*list*/
      ctx[0];

      const get_key = ctx =>
      /*getKey*/
      ctx[8](
      /*item*/
      ctx[15]);

      for (let i = 0; i < each_value.length; i += 1) {
        let child_ctx = get_each_context(ctx, each_value, i);
        let key = get_key(child_ctx);
        each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
      }

      return {
        c() {
          ul = element("ul");

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].c();
          }

          attr(ul, "class", "svelte-u2qjut");
        },

        m(target, anchor) {
          insert(target, ul, anchor);

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].m(ul, null);
          }

          current = true;
        },

        p(ctx, dirty) {
          if (dirty &
          /*list, JSON, getKey, isOver, start, over, leave, drop, $$scope*/
          1523) {
            each_value =
            /*list*/
            ctx[0];
            group_outros();

            for (let i = 0; i < each_blocks.length; i += 1) each_blocks[i].r();

            each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, ul, fix_and_outro_and_destroy_block, create_each_block, null, get_each_context);

            for (let i = 0; i < each_blocks.length; i += 1) each_blocks[i].a();

            check_outros();
          }
        },

        i(local) {
          if (current) return;

          for (let i = 0; i < each_value.length; i += 1) {
            transition_in(each_blocks[i]);
          }

          current = true;
        },

        o(local) {
          for (let i = 0; i < each_blocks.length; i += 1) {
            transition_out(each_blocks[i]);
          }

          current = false;
        },

        d(detaching) {
          if (detaching) detach(ul);

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].d();
          }
        }

      };
    } // (97:29)            


    function fallback_block(ctx) {
      let p;
      let t_value =
      /*getKey*/
      ctx[8](
      /*item*/
      ctx[15]) + "";
      let t;
      return {
        c() {
          p = element("p");
          t = text(t_value);
        },

        m(target, anchor) {
          insert(target, p, anchor);
          append(p, t);
        },

        p(ctx, dirty) {
          if (dirty &
          /*list*/
          1 && t_value !== (t_value =
          /*getKey*/
          ctx[8](
          /*item*/
          ctx[15]) + "")) set_data(t, t_value);
        },

        d(detaching) {
          if (detaching) detach(p);
        }

      };
    } // (84:4) {#each list as item, index (getKey(item))}


    function create_each_block(key_2, ctx) {
      let li;
      let t;
      let li_data_index_value;
      let li_data_id_value;
      let li_intro;
      let li_outro;
      let rect;
      let stop_animation = noop;
      let current;
      let mounted;
      let dispose;
      const default_slot_template =
      /*#slots*/
      ctx[11].default;
      const default_slot = create_slot(default_slot_template, ctx,
      /*$$scope*/
      ctx[10], get_default_slot_context);
      const default_slot_or_fallback = default_slot || fallback_block(ctx);
      return {
        key: key_2,
        first: null,

        c() {
          li = element("li");
          if (default_slot_or_fallback) default_slot_or_fallback.c();
          t = space();
          attr(li, "data-index", li_data_index_value =
          /*index*/
          ctx[17]);
          attr(li, "data-id", li_data_id_value = JSON.stringify(
          /*getKey*/
          ctx[8](
          /*item*/
          ctx[15])));
          attr(li, "draggable", "true");
          attr(li, "class", "svelte-u2qjut");
          toggle_class(li, "over",
          /*getKey*/
          ctx[8](
          /*item*/
          ctx[15]) ===
          /*isOver*/
          ctx[1]);
          this.first = li;
        },

        m(target, anchor) {
          insert(target, li, anchor);

          if (default_slot_or_fallback) {
            default_slot_or_fallback.m(li, null);
          }

          append(li, t);
          current = true;

          if (!mounted) {
            dispose = [listen(li, "dragstart",
            /*start*/
            ctx[4]), listen(li, "dragover",
            /*over*/
            ctx[5]), listen(li, "dragleave",
            /*leave*/
            ctx[6]), listen(li, "drop",
            /*drop*/
            ctx[7])];
            mounted = true;
          }
        },

        p(new_ctx, dirty) {
          ctx = new_ctx;

          if (default_slot) {
            if (default_slot.p && (!current || dirty &
            /*$$scope, list*/
            1025)) {
              update_slot(default_slot, default_slot_template, ctx,
              /*$$scope*/
              ctx[10], !current ? -1 : dirty, get_default_slot_changes, get_default_slot_context);
            }
          } else {
            if (default_slot_or_fallback && default_slot_or_fallback.p && (!current || dirty &
            /*list*/
            1)) {
              default_slot_or_fallback.p(ctx, !current ? -1 : dirty);
            }
          }

          if (!current || dirty &
          /*list*/
          1 && li_data_index_value !== (li_data_index_value =
          /*index*/
          ctx[17])) {
            attr(li, "data-index", li_data_index_value);
          }

          if (!current || dirty &
          /*list*/
          1 && li_data_id_value !== (li_data_id_value = JSON.stringify(
          /*getKey*/
          ctx[8](
          /*item*/
          ctx[15])))) {
            attr(li, "data-id", li_data_id_value);
          }

          if (dirty &
          /*getKey, list, isOver*/
          259) {
            toggle_class(li, "over",
            /*getKey*/
            ctx[8](
            /*item*/
            ctx[15]) ===
            /*isOver*/
            ctx[1]);
          }
        },

        r() {
          rect = li.getBoundingClientRect();
        },

        f() {
          fix_position(li);
          stop_animation();
          add_transform(li, rect);
        },

        a() {
          stop_animation();
          stop_animation = create_animation(li, rect, flip, {
            duration: 300
          });
        },

        i(local) {
          if (current) return;
          transition_in(default_slot_or_fallback, local);
          add_render_callback(() => {
            if (li_outro) li_outro.end(1);
            if (!li_intro) li_intro = create_in_transition(li,
            /*receive*/
            ctx[3], {
              key:
              /*getKey*/
              ctx[8](
              /*item*/
              ctx[15])
            });
            li_intro.start();
          });
          current = true;
        },

        o(local) {
          transition_out(default_slot_or_fallback, local);
          if (li_intro) li_intro.invalidate();
          li_outro = create_out_transition(li,
          /*send*/
          ctx[2], {
            key:
            /*getKey*/
            ctx[8](
            /*item*/
            ctx[15])
          });
          current = false;
        },

        d(detaching) {
          if (detaching) detach(li);
          if (default_slot_or_fallback) default_slot_or_fallback.d(detaching);
          if (detaching && li_outro) li_outro.end();
          mounted = false;
          run_all(dispose);
        }

      };
    }

    function create_fragment(ctx) {
      let if_block_anchor;
      let current;
      let if_block =
      /*list*/
      ctx[0] &&
      /*list*/
      ctx[0].length && create_if_block(ctx);
      return {
        c() {
          if (if_block) if_block.c();
          if_block_anchor = empty();
        },

        m(target, anchor) {
          if (if_block) if_block.m(target, anchor);
          insert(target, if_block_anchor, anchor);
          current = true;
        },

        p(ctx, [dirty]) {
          if (
          /*list*/
          ctx[0] &&
          /*list*/
          ctx[0].length) {
            if (if_block) {
              if_block.p(ctx, dirty);

              if (dirty &
              /*list*/
              1) {
                transition_in(if_block, 1);
              }
            } else {
              if_block = create_if_block(ctx);
              if_block.c();
              transition_in(if_block, 1);
              if_block.m(if_block_anchor.parentNode, if_block_anchor);
            }
          } else if (if_block) {
            group_outros();
            transition_out(if_block, 1, 1, () => {
              if_block = null;
            });
            check_outros();
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
          if (if_block) if_block.d(detaching);
          if (detaching) detach(if_block_anchor);
        }

      };
    }

    function instance($$self, $$props, $$invalidate) {
      let {
        $$slots: slots = {},
        $$scope
      } = $$props;
      const [send, receive] = crossfade({
        duration: d => Math.sqrt(d * 200),

        fallback(node, params) {
          const style = getComputedStyle(node);
          const transform = style.transform === "none" ? "" : style.transform;
          return {
            duration: 600,
            easing: quintOut,
            css: t => `
					transform: ${transform} scale(${t});
					opacity: ${t}
				`
          };
        }

      }); // DRAG AND DROP

      let isOver = false;

      const getDraggedParent = node => node.dataset.index && node.dataset || getDraggedParent(node.parentNode);

      const start = ev => {
        ev.dataTransfer.setData("source", ev.target.dataset.index);
      };

      const over = ev => {
        ev.preventDefault();
        let dragged = getDraggedParent(ev.target);
        if (isOver !== dragged.id) $$invalidate(1, isOver = JSON.parse(dragged.id));
      };

      const leave = ev => {
        let dragged = getDraggedParent(ev.target);
        if (isOver === dragged.id) $$invalidate(1, isOver = false);
      };

      const drop = ev => {
        $$invalidate(1, isOver = false);
        ev.preventDefault();
        let dragged = getDraggedParent(ev.target);
        let from = ev.dataTransfer.getData("source");
        let to = dragged.index;
        reorder({
          from,
          to
        });
      };

      const dispatch = createEventDispatcher();

      const reorder = ({
        from,
        to
      }) => {
        let newList = [...list];
        newList[from] = [newList[to], newList[to] = newList[from]][0];
        dispatch("sort", newList);
      }; // UTILS


      const getKey = item => key ? item[key] : item;

      let {
        list
      } = $$props;
      let {
        key
      } = $$props;

      $$self.$$set = $$props => {
        if ("list" in $$props) $$invalidate(0, list = $$props.list);
        if ("key" in $$props) $$invalidate(9, key = $$props.key);
        if ("$$scope" in $$props) $$invalidate(10, $$scope = $$props.$$scope);
      };

      return [list, isOver, send, receive, start, over, leave, drop, getKey, key, $$scope, slots];
    }

    class SortableList extends SvelteComponent {
      constructor(options) {
        super();
        init(this, options, instance, create_fragment, safe_not_equal, {
          list: 0,
          key: 9
        });
      }

    }

    function cubicOut$1(t) {
      var f = t - 1.0;
      return f * f * f + 1.0;
    }

    const Datastore = require('nedb');

    const app = require('electron').remote.app;

    const root = app.getAppPath();

    let abbreviate = (content, limit) => {
      if (content && content.length > limit) return content.substr(0, limit) + '...';else return content;
    };

    function saveLOA(data, datadir = root + '/data') {
      return new Promise((resolve, reject) => {
        const db = new Datastore({
          filename: datadir + '/loas.db',
          autoload: true
        });
        const record = new Datastore({
          filename: datadir + '/records.db',
          autoload: true
        });
        db.update({
          "student._id": data.student._id
        }, //Find
        {
          $set: data
        }, //Update data
        {
          upsert: true
        }, //options
        err => {
          if (err) reject();else record.insert(data, err => {
            if (err) reject();
            resolve(true);
          });
        });
      });
    }

    function loadLOA(student, datadir = root + '/data') {
      return new Promise((resolve, reject) => {
        const db = new Datastore({
          filename: datadir + '/loas.db',
          autoload: true
        });
        db.findOne({
          "student._id": student._id
        }, (err, doc) => {
          if (err) reject(err);else resolve(doc);
        });
      });
    }

    function searchLOA(search, datadir = root + '/data') {
      return new Promise((resolve, reject) => {
        const db = new Datastore({
          filename: datadir + '/loas.db',
          autoload: true
        });
        db.find({
          $or: [{
            "student._id": search._id
          }, {
            $and: [{
              "student.fname": search.fname
            }, {
              "student.lname": search.lname
            }]
          }, {
            "student.fname": search.fname
          }, {
            "student.lname": search.lname
          }]
        }).limit(25).exec((err, doc) => {
          if (err) reject(err);else resolve(doc);
        });
      });
    }

    function loadAccommodations(datadir = root + '/data') {
      return new Promise((resolve, reject) => {
        const db = new Datastore({
          filename: datadir + '/accoms.db',
          autoload: true
        });
        db.find({}).sort({
          name: 1
        }).exec((err, doc) => {
          if (err) reject(err);else resolve(doc);
        });
      });
    }

    function saveAccommodation(data, datadir = root + '/data') {
      return new Promise((resolve, reject) => {
        const db = new Datastore({
          filename: datadir + '/accoms.db',
          autoload: true
        });
        db.update({
          _id: data._id
        }, //Find
        data, //Update data
        {
          upsert: true
        }, //options
        err => {
          if (err) reject();
          resolve(true);
        });
      });
    }

    function removeAccommodation(id, datadir = root + '/data') {
      return new Promise((resolve, reject) => {
        const db = new Datastore({
          filename: datadir + '/accoms.db',
          autoload: true
        });
        db.remove({
          _id: id
        }, {}, err => {
          if (err) reject();
          resolve(true);
        });
      });
    }

    function loadStudents(skip, take, search = "", datadir = root + '/data') {
      return new Promise((resolve, reject) => {
        const db = new Datastore({
          filename: datadir + '/loas.db',
          autoload: true
        });
        let findFunc = null;

        if (search && search.includes(' ') || search.includes(',')) {
          let searchTerms;
          if (search.includes(', ')) searchTerms = search.split(", ");else if (search.includes(',')) searchTerms = search.split(",");else searchTerms = search.split(" ");
          findFunc = db.find({
            $or: [{
              $and: [{
                "student.fname": new RegExp(searchTerms[0].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i')
              }, {
                "student.lname": new RegExp(searchTerms[1].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i')
              }]
            }, {
              $and: [{
                "student.fname": new RegExp(searchTerms[1].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i')
              }, {
                "student.lname": new RegExp(searchTerms[0].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i')
              }]
            }]
          });
        } else if (search) {
          findFunc = db.find({
            $or: [{
              "student._id": new RegExp(search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i')
            }, {
              "student.fname": new RegExp(search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i')
            }, {
              "student.lname": new RegExp(search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i')
            }]
          });
        } else {
          findFunc = db.find({});
        }

        findFunc.skip(skip).limit(take).exec((err, doc) => {
          if (err) reject(err);else {
            doc.forEach(student => {
              if (student.accoms) {
                student.accomsList = student.accoms.map(accom => {
                  return accom.name;
                });
              }
            });
            resolve(doc);
          }
        });
      });
    }

    function countStudents(datadir = root + '/data') {
      return new Promise((resolve, reject) => {
        const db = new Datastore({
          filename: datadir + '/loas.db',
          autoload: true
        });
        db.count({}, (err, count) => {
          if (err) reject(err);else resolve(count);
        });
      });
    }

    function saveStudent(data, datadir = root + '/data') {
      return new Promise((resolve, reject) => {
        const db = new Datastore({
          filename: datadir + '/loas.db',
          autoload: true
        });
        db.update({
          "student._id": data.student._id
        }, //Find
        data, //Update data
        {
          upsert: true
        }, //options
        err => {
          if (err) reject();
          resolve(true);
        });
      });
    }

    function removeStudent(id, datadir = root + '/data') {
      return new Promise((resolve, reject) => {
        const db = new Datastore({
          filename: datadir + '/loas.db',
          autoload: true
        });
        db.remove({
          "student._id": id
        }, {}, err => {
          if (err) reject();
          resolve(true);
        });
      });
    }

    function loadRecords(id, datadir = root + '/data') {
      return new Promise((resolve, reject) => {
        const loas = new Datastore({
          filename: datadir + '/loas.db',
          autoload: true
        });
        const records = new Datastore({
          filename: datadir + '/records.db',
          autoload: true
        });
        loas.findOne({
          "student._id": id
        }, (err, student) => {
          if (err) reject(err);else records.find({
            "student._id": id
          }, (err, records) => {
            if (err) reject(err);else {
              student.records = records.sort((a, b) => {
                return b.dateUpdated - a.dateUpdated;
              });
              resolve(student);
            }
          });
        });
      });
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */


    function writable(value, start = noop) {
      let stop;
      const subscribers = [];

      function set(new_value) {
        if (safe_not_equal(value, new_value)) {
          value = new_value;

          if (stop) {
            // store is ready
            const run_queue = !subscriber_queue.length;

            for (let i = 0; i < subscribers.length; i += 1) {
              const s = subscribers[i];
              s[1]();
              subscriber_queue.push(s, value);
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
        subscribers.push(subscriber);

        if (subscribers.length === 1) {
          stop = start(set) || noop;
        }

        run(value);
        return () => {
          const index = subscribers.indexOf(subscriber);

          if (index !== -1) {
            subscribers.splice(index, 1);
          }

          if (subscribers.length === 0) {
            stop();
            stop = null;
          }
        };
      }

      return {
        set,
        update,
        subscribe
      };
    }

    const fs = require('fs');

    const app$1 = require('electron').remote.app;

    const root$1 = app$1.getPath('home');
    const settings = writable({});

    if (fs.existsSync(root$1 + '/accommodate/appsettings.json')) {
      settings.set(JSON.parse(fs.readFileSync(root$1 + '/accommodate/appsettings.json')));
    } else {
      if (!fs.existsSync(root$1 + '/accommodate')) fs.mkdirSync(root$1 + '/accommodate');
      settings.set({
        abbrev: "Notice",
        services: "Services",
        students: "Students",
        databasedir: root$1 + '/accommodate',
        backupdir: root$1 + '/accommodate',
        systemdir: root$1 + '/accommodate'
      });
    }

    let pluralize = str => {
      if (str.length > 0) {
        if (str.charAt(str.length - 1) == 'x' || str.charAt(str.length - 1) == 'z' || str.charAt(str.length - 1) == 'h' && (str.charAt(str.length - 2) == 's' || str.charAt(str.length - 2) == 'c') || str.charAt(str.length - 1) == 's' && str.charAt(str.length - 2) == 's') {
          str = str.concat('es');
        } else if (str.charAt(str.length - 1) != 's') {
          str = str.concat('s');
        }
      }

      return str;
    };

    const formatText = (str, plur = true, uc = true, allcaps = false) => {
      if (plur) str = pluralize(str);else if (str.charAt(str.length - 1) == 's') str = str.substring(0, str.length - 1);

      if (!allcaps) {
        str = str.toLowerCase();
        if (uc) str = str.replace(str.charAt(0), str.charAt(0).toUpperCase(), 1);
      } else {
        if (str.length < 4) str = str.toUpperCase();else str = str.replace(str.charAt(0), str.charAt(0).toUpperCase(), 1);
      }

      return str;
    };
    let changeSettings = data => {
      fs.writeFileSync(root$1 + '/accommodate/appsettings.json', JSON.stringify(data));
    };

    const getCalendarPage = (month, year, dayProps, weekStart = 0) => {
      let date = new Date(year, month, 1);
      date.setDate(date.getDate() - date.getDay() + weekStart);
      let nextMonth = month === 11 ? 0 : month + 1; // ensure days starts on Sunday
      // and end on saturday

      let weeks = [];

      while (date.getMonth() !== nextMonth || date.getDay() !== weekStart || weeks.length !== 6) {
        if (date.getDay() === weekStart) weeks.unshift({
          days: [],
          id: `${year}${month}${year}${weeks.length}`
        });
        const updated = Object.assign({
          partOfMonth: date.getMonth() === month,
          day: date.getDate(),
          month: date.getMonth(),
          year: date.getFullYear(),
          date: new Date(date)
        }, dayProps(date));
        weeks[0].days.push(updated);
        date.setDate(date.getDate() + 1);
      }

      weeks.reverse();
      return {
        month,
        year,
        weeks
      };
    };

    const getDayPropsHandler = (start, end, selectableCallback) => {
      let today = new Date();
      today.setHours(0, 0, 0, 0);
      return date => {
        const isInRange = date >= start && date <= end;
        return {
          isInRange,
          selectable: isInRange && (!selectableCallback || selectableCallback(date)),
          isToday: date.getTime() === today.getTime()
        };
      };
    };

    function getMonths(start, end, selectableCallback = null, weekStart = 0) {
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      let endDate = new Date(end.getFullYear(), end.getMonth() + 1, 1);
      let months = [];
      let date = new Date(start.getFullYear(), start.getMonth(), 1);
      let dayPropsHandler = getDayPropsHandler(start, end, selectableCallback);

      while (date < endDate) {
        months.push(getCalendarPage(date.getMonth(), date.getFullYear(), dayPropsHandler, weekStart));
        date.setMonth(date.getMonth() + 1);
      }

      return months;
    }
    const areDatesEquivalent = (a, b) => a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

    /* node_modules\svelte-calendar\src\Components\Week.svelte generated by Svelte v3.38.3 */

    function get_each_context$1(ctx, list, i) {
      const child_ctx = ctx.slice();
      child_ctx[7] = list[i];
      return child_ctx;
    } // (20:2) {#each days as day}


    function create_each_block$1(ctx) {
      let div;
      let button;
      let t0_value =
      /*day*/
      ctx[7].date.getDate() + "";
      let t0;
      let t1;
      let mounted;
      let dispose;

      function click_handler() {
        return (
          /*click_handler*/
          ctx[6](
          /*day*/
          ctx[7])
        );
      }

      return {
        c() {
          div = element("div");
          button = element("button");
          t0 = text(t0_value);
          t1 = space();
          attr(button, "class", "day--label svelte-ys1a4x");
          attr(button, "type", "button");
          toggle_class(button, "selected", areDatesEquivalent(
          /*day*/
          ctx[7].date,
          /*selected*/
          ctx[1]));
          toggle_class(button, "highlighted", areDatesEquivalent(
          /*day*/
          ctx[7].date,
          /*highlighted*/
          ctx[2]));
          toggle_class(button, "shake-date",
          /*shouldShakeDate*/
          ctx[3] && areDatesEquivalent(
          /*day*/
          ctx[7].date,
          /*shouldShakeDate*/
          ctx[3]));
          toggle_class(button, "disabled", !
          /*day*/
          ctx[7].selectable);
          attr(div, "class", "day svelte-ys1a4x");
          toggle_class(div, "outside-month", !
          /*day*/
          ctx[7].partOfMonth);
          toggle_class(div, "is-today",
          /*day*/
          ctx[7].isToday);
          toggle_class(div, "is-disabled", !
          /*day*/
          ctx[7].selectable);
        },

        m(target, anchor) {
          insert(target, div, anchor);
          append(div, button);
          append(button, t0);
          append(div, t1);

          if (!mounted) {
            dispose = listen(button, "click", click_handler);
            mounted = true;
          }
        },

        p(new_ctx, dirty) {
          ctx = new_ctx;
          if (dirty &
          /*days*/
          1 && t0_value !== (t0_value =
          /*day*/
          ctx[7].date.getDate() + "")) set_data(t0, t0_value);

          if (dirty &
          /*areDatesEquivalent, days, selected*/
          3) {
            toggle_class(button, "selected", areDatesEquivalent(
            /*day*/
            ctx[7].date,
            /*selected*/
            ctx[1]));
          }

          if (dirty &
          /*areDatesEquivalent, days, highlighted*/
          5) {
            toggle_class(button, "highlighted", areDatesEquivalent(
            /*day*/
            ctx[7].date,
            /*highlighted*/
            ctx[2]));
          }

          if (dirty &
          /*shouldShakeDate, areDatesEquivalent, days*/
          9) {
            toggle_class(button, "shake-date",
            /*shouldShakeDate*/
            ctx[3] && areDatesEquivalent(
            /*day*/
            ctx[7].date,
            /*shouldShakeDate*/
            ctx[3]));
          }

          if (dirty &
          /*days*/
          1) {
            toggle_class(button, "disabled", !
            /*day*/
            ctx[7].selectable);
          }

          if (dirty &
          /*days*/
          1) {
            toggle_class(div, "outside-month", !
            /*day*/
            ctx[7].partOfMonth);
          }

          if (dirty &
          /*days*/
          1) {
            toggle_class(div, "is-today",
            /*day*/
            ctx[7].isToday);
          }

          if (dirty &
          /*days*/
          1) {
            toggle_class(div, "is-disabled", !
            /*day*/
            ctx[7].selectable);
          }
        },

        d(detaching) {
          if (detaching) detach(div);
          mounted = false;
          dispose();
        }

      };
    }

    function create_fragment$1(ctx) {
      let div;
      let div_intro;
      let div_outro;
      let current;
      let each_value =
      /*days*/
      ctx[0];
      let each_blocks = [];

      for (let i = 0; i < each_value.length; i += 1) {
        each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
      }

      return {
        c() {
          div = element("div");

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].c();
          }

          attr(div, "class", "week svelte-ys1a4x");
        },

        m(target, anchor) {
          insert(target, div, anchor);

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].m(div, null);
          }

          current = true;
        },

        p(new_ctx, [dirty]) {
          ctx = new_ctx;

          if (dirty &
          /*days, areDatesEquivalent, selected, highlighted, shouldShakeDate, dispatch*/
          47) {
            each_value =
            /*days*/
            ctx[0];
            let i;

            for (i = 0; i < each_value.length; i += 1) {
              const child_ctx = get_each_context$1(ctx, each_value, i);

              if (each_blocks[i]) {
                each_blocks[i].p(child_ctx, dirty);
              } else {
                each_blocks[i] = create_each_block$1(child_ctx);
                each_blocks[i].c();
                each_blocks[i].m(div, null);
              }
            }

            for (; i < each_blocks.length; i += 1) {
              each_blocks[i].d(1);
            }

            each_blocks.length = each_value.length;
          }
        },

        i(local) {
          if (current) return;

          if (local) {
            add_render_callback(() => {
              if (div_outro) div_outro.end(1);
              if (!div_intro) div_intro = create_in_transition(div, fly, {
                x:
                /*direction*/
                ctx[4] * 50,
                duration: 180,
                delay: 90
              });
              div_intro.start();
            });
          }

          current = true;
        },

        o(local) {
          if (div_intro) div_intro.invalidate();

          if (local) {
            div_outro = create_out_transition(div, fade, {
              duration: 180
            });
          }

          current = false;
        },

        d(detaching) {
          if (detaching) detach(div);
          destroy_each(each_blocks, detaching);
          if (detaching && div_outro) div_outro.end();
        }

      };
    }

    function instance$1($$self, $$props, $$invalidate) {
      const dispatch = createEventDispatcher();
      let {
        days
      } = $$props;
      let {
        selected
      } = $$props;
      let {
        highlighted
      } = $$props;
      let {
        shouldShakeDate
      } = $$props;
      let {
        direction
      } = $$props;

      const click_handler = day => dispatch("dateSelected", day.date);

      $$self.$$set = $$props => {
        if ("days" in $$props) $$invalidate(0, days = $$props.days);
        if ("selected" in $$props) $$invalidate(1, selected = $$props.selected);
        if ("highlighted" in $$props) $$invalidate(2, highlighted = $$props.highlighted);
        if ("shouldShakeDate" in $$props) $$invalidate(3, shouldShakeDate = $$props.shouldShakeDate);
        if ("direction" in $$props) $$invalidate(4, direction = $$props.direction);
      };

      return [days, selected, highlighted, shouldShakeDate, direction, dispatch, click_handler];
    }

    class Week extends SvelteComponent {
      constructor(options) {
        super();
        init(this, options, instance$1, create_fragment$1, safe_not_equal, {
          days: 0,
          selected: 1,
          highlighted: 2,
          shouldShakeDate: 3,
          direction: 4
        });
      }

    }

    /* node_modules\svelte-calendar\src\Components\Month.svelte generated by Svelte v3.38.3 */

    function get_each_context$2(ctx, list, i) {
      const child_ctx = ctx.slice();
      child_ctx[8] = list[i];
      return child_ctx;
    } // (20:2) {#each visibleMonth.weeks as week (week.id) }


    function create_each_block$2(key_1, ctx) {
      let first;
      let week;
      let current;
      week = new Week({
        props: {
          days:
          /*week*/
          ctx[8].days,
          selected:
          /*selected*/
          ctx[1],
          highlighted:
          /*highlighted*/
          ctx[2],
          shouldShakeDate:
          /*shouldShakeDate*/
          ctx[3],
          direction:
          /*direction*/
          ctx[4]
        }
      });
      week.$on("dateSelected",
      /*dateSelected_handler*/
      ctx[7]);
      return {
        key: key_1,
        first: null,

        c() {
          first = empty();
          create_component(week.$$.fragment);
          this.first = first;
        },

        m(target, anchor) {
          insert(target, first, anchor);
          mount_component(week, target, anchor);
          current = true;
        },

        p(new_ctx, dirty) {
          ctx = new_ctx;
          const week_changes = {};
          if (dirty &
          /*visibleMonth*/
          1) week_changes.days =
          /*week*/
          ctx[8].days;
          if (dirty &
          /*selected*/
          2) week_changes.selected =
          /*selected*/
          ctx[1];
          if (dirty &
          /*highlighted*/
          4) week_changes.highlighted =
          /*highlighted*/
          ctx[2];
          if (dirty &
          /*shouldShakeDate*/
          8) week_changes.shouldShakeDate =
          /*shouldShakeDate*/
          ctx[3];
          if (dirty &
          /*direction*/
          16) week_changes.direction =
          /*direction*/
          ctx[4];
          week.$set(week_changes);
        },

        i(local) {
          if (current) return;
          transition_in(week.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(week.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          if (detaching) detach(first);
          destroy_component(week, detaching);
        }

      };
    }

    function create_fragment$2(ctx) {
      let div;
      let each_blocks = [];
      let each_1_lookup = new Map();
      let current;
      let each_value =
      /*visibleMonth*/
      ctx[0].weeks;

      const get_key = ctx =>
      /*week*/
      ctx[8].id;

      for (let i = 0; i < each_value.length; i += 1) {
        let child_ctx = get_each_context$2(ctx, each_value, i);
        let key = get_key(child_ctx);
        each_1_lookup.set(key, each_blocks[i] = create_each_block$2(key, child_ctx));
      }

      return {
        c() {
          div = element("div");

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].c();
          }

          attr(div, "class", "month-container svelte-1ddf0wu");
        },

        m(target, anchor) {
          insert(target, div, anchor);

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].m(div, null);
          }

          current = true;
        },

        p(ctx, [dirty]) {
          if (dirty &
          /*visibleMonth, selected, highlighted, shouldShakeDate, direction*/
          31) {
            each_value =
            /*visibleMonth*/
            ctx[0].weeks;
            group_outros();
            each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div, outro_and_destroy_block, create_each_block$2, null, get_each_context$2);
            check_outros();
          }
        },

        i(local) {
          if (current) return;

          for (let i = 0; i < each_value.length; i += 1) {
            transition_in(each_blocks[i]);
          }

          current = true;
        },

        o(local) {
          for (let i = 0; i < each_blocks.length; i += 1) {
            transition_out(each_blocks[i]);
          }

          current = false;
        },

        d(detaching) {
          if (detaching) detach(div);

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].d();
          }
        }

      };
    }

    function instance$2($$self, $$props, $$invalidate) {
      let {
        id
      } = $$props;
      let {
        visibleMonth
      } = $$props;
      let {
        selected
      } = $$props;
      let {
        highlighted
      } = $$props;
      let {
        shouldShakeDate
      } = $$props;
      let lastId = id;
      let direction;

      function dateSelected_handler(event) {
        bubble.call(this, $$self, event);
      }

      $$self.$$set = $$props => {
        if ("id" in $$props) $$invalidate(5, id = $$props.id);
        if ("visibleMonth" in $$props) $$invalidate(0, visibleMonth = $$props.visibleMonth);
        if ("selected" in $$props) $$invalidate(1, selected = $$props.selected);
        if ("highlighted" in $$props) $$invalidate(2, highlighted = $$props.highlighted);
        if ("shouldShakeDate" in $$props) $$invalidate(3, shouldShakeDate = $$props.shouldShakeDate);
      };

      $$self.$$.update = () => {
        if ($$self.$$.dirty &
        /*lastId, id*/
        96) {
           {
            $$invalidate(4, direction = lastId < id ? 1 : -1);
            $$invalidate(6, lastId = id);
          }
        }
      };

      return [visibleMonth, selected, highlighted, shouldShakeDate, direction, id, lastId, dateSelected_handler];
    }

    class Month extends SvelteComponent {
      constructor(options) {
        super();
        init(this, options, instance$2, create_fragment$2, safe_not_equal, {
          id: 5,
          visibleMonth: 0,
          selected: 1,
          highlighted: 2,
          shouldShakeDate: 3
        });
      }

    }

    /* node_modules\svelte-calendar\src\Components\NavBar.svelte generated by Svelte v3.38.3 */

    function get_each_context$3(ctx, list, i) {
      const child_ctx = ctx.slice();
      child_ctx[15] = list[i];
      child_ctx[17] = i;
      return child_ctx;
    } // (64:4) {#each availableMonths as monthDefinition, index}


    function create_each_block$3(ctx) {
      let div;
      let span;
      let t0_value =
      /*monthDefinition*/
      ctx[15].abbrev + "";
      let t0;
      let t1;
      let mounted;
      let dispose;

      function click_handler_2(...args) {
        return (
          /*click_handler_2*/
          ctx[14](
          /*monthDefinition*/
          ctx[15],
          /*index*/
          ctx[17], ...args)
        );
      }

      return {
        c() {
          div = element("div");
          span = element("span");
          t0 = text(t0_value);
          t1 = space();
          attr(span, "class", "svelte-md6kye");
          attr(div, "class", "month-selector--month svelte-md6kye");
          toggle_class(div, "selected",
          /*index*/
          ctx[17] ===
          /*month*/
          ctx[0]);
          toggle_class(div, "selectable",
          /*monthDefinition*/
          ctx[15].selectable);
        },

        m(target, anchor) {
          insert(target, div, anchor);
          append(div, span);
          append(span, t0);
          append(div, t1);

          if (!mounted) {
            dispose = listen(div, "click", click_handler_2);
            mounted = true;
          }
        },

        p(new_ctx, dirty) {
          ctx = new_ctx;
          if (dirty &
          /*availableMonths*/
          64 && t0_value !== (t0_value =
          /*monthDefinition*/
          ctx[15].abbrev + "")) set_data(t0, t0_value);

          if (dirty &
          /*month*/
          1) {
            toggle_class(div, "selected",
            /*index*/
            ctx[17] ===
            /*month*/
            ctx[0]);
          }

          if (dirty &
          /*availableMonths*/
          64) {
            toggle_class(div, "selectable",
            /*monthDefinition*/
            ctx[15].selectable);
          }
        },

        d(detaching) {
          if (detaching) detach(div);
          mounted = false;
          dispose();
        }

      };
    }

    function create_fragment$3(ctx) {
      let div5;
      let div3;
      let div0;
      let t0;
      let div1;
      let t1_value =
      /*monthsOfYear*/
      ctx[4][
      /*month*/
      ctx[0]][0] + "";
      let t1;
      let t2;
      let t3;
      let t4;
      let div2;
      let t5;
      let div4;
      let mounted;
      let dispose;
      let each_value =
      /*availableMonths*/
      ctx[6];
      let each_blocks = [];

      for (let i = 0; i < each_value.length; i += 1) {
        each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
      }

      return {
        c() {
          div5 = element("div");
          div3 = element("div");
          div0 = element("div");
          div0.innerHTML = `<i class="arrow left svelte-md6kye"></i>`;
          t0 = space();
          div1 = element("div");
          t1 = text(t1_value);
          t2 = space();
          t3 = text(
          /*year*/
          ctx[1]);
          t4 = space();
          div2 = element("div");
          div2.innerHTML = `<i class="arrow right svelte-md6kye"></i>`;
          t5 = space();
          div4 = element("div");

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].c();
          }

          attr(div0, "class", "control svelte-md6kye");
          toggle_class(div0, "enabled",
          /*canDecrementMonth*/
          ctx[3]);
          attr(div1, "class", "label svelte-md6kye");
          attr(div2, "class", "control svelte-md6kye");
          toggle_class(div2, "enabled",
          /*canIncrementMonth*/
          ctx[2]);
          attr(div3, "class", "heading-section svelte-md6kye");
          attr(div4, "class", "month-selector svelte-md6kye");
          toggle_class(div4, "open",
          /*monthSelectorOpen*/
          ctx[5]);
          attr(div5, "class", "title");
        },

        m(target, anchor) {
          insert(target, div5, anchor);
          append(div5, div3);
          append(div3, div0);
          append(div3, t0);
          append(div3, div1);
          append(div1, t1);
          append(div1, t2);
          append(div1, t3);
          append(div3, t4);
          append(div3, div2);
          append(div5, t5);
          append(div5, div4);

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].m(div4, null);
          }

          if (!mounted) {
            dispose = [listen(div0, "click",
            /*click_handler*/
            ctx[12]), listen(div1, "click",
            /*toggleMonthSelectorOpen*/
            ctx[8]), listen(div2, "click",
            /*click_handler_1*/
            ctx[13])];
            mounted = true;
          }
        },

        p(ctx, [dirty]) {
          if (dirty &
          /*canDecrementMonth*/
          8) {
            toggle_class(div0, "enabled",
            /*canDecrementMonth*/
            ctx[3]);
          }

          if (dirty &
          /*monthsOfYear, month*/
          17 && t1_value !== (t1_value =
          /*monthsOfYear*/
          ctx[4][
          /*month*/
          ctx[0]][0] + "")) set_data(t1, t1_value);
          if (dirty &
          /*year*/
          2) set_data(t3,
          /*year*/
          ctx[1]);

          if (dirty &
          /*canIncrementMonth*/
          4) {
            toggle_class(div2, "enabled",
            /*canIncrementMonth*/
            ctx[2]);
          }

          if (dirty &
          /*month, availableMonths, monthSelected*/
          577) {
            each_value =
            /*availableMonths*/
            ctx[6];
            let i;

            for (i = 0; i < each_value.length; i += 1) {
              const child_ctx = get_each_context$3(ctx, each_value, i);

              if (each_blocks[i]) {
                each_blocks[i].p(child_ctx, dirty);
              } else {
                each_blocks[i] = create_each_block$3(child_ctx);
                each_blocks[i].c();
                each_blocks[i].m(div4, null);
              }
            }

            for (; i < each_blocks.length; i += 1) {
              each_blocks[i].d(1);
            }

            each_blocks.length = each_value.length;
          }

          if (dirty &
          /*monthSelectorOpen*/
          32) {
            toggle_class(div4, "open",
            /*monthSelectorOpen*/
            ctx[5]);
          }
        },

        i: noop,
        o: noop,

        d(detaching) {
          if (detaching) detach(div5);
          destroy_each(each_blocks, detaching);
          mounted = false;
          run_all(dispose);
        }

      };
    }

    function instance$3($$self, $$props, $$invalidate) {
      const dispatch = createEventDispatcher();
      let {
        month
      } = $$props;
      let {
        year
      } = $$props;
      let {
        start
      } = $$props;
      let {
        end
      } = $$props;
      let {
        canIncrementMonth
      } = $$props;
      let {
        canDecrementMonth
      } = $$props;
      let {
        monthsOfYear
      } = $$props;
      let monthSelectorOpen = false;
      let availableMonths;

      function toggleMonthSelectorOpen() {
        $$invalidate(5, monthSelectorOpen = !monthSelectorOpen);
      }

      function monthSelected(event, {
        m,
        i
      }) {
        event.stopPropagation();
        if (!m.selectable) return;
        dispatch("monthSelected", i);
        toggleMonthSelectorOpen();
      }

      const click_handler = () => dispatch("incrementMonth", -1);

      const click_handler_1 = () => dispatch("incrementMonth", 1);

      const click_handler_2 = (monthDefinition, index, e) => monthSelected(e, {
        m: monthDefinition,
        i: index
      });

      $$self.$$set = $$props => {
        if ("month" in $$props) $$invalidate(0, month = $$props.month);
        if ("year" in $$props) $$invalidate(1, year = $$props.year);
        if ("start" in $$props) $$invalidate(10, start = $$props.start);
        if ("end" in $$props) $$invalidate(11, end = $$props.end);
        if ("canIncrementMonth" in $$props) $$invalidate(2, canIncrementMonth = $$props.canIncrementMonth);
        if ("canDecrementMonth" in $$props) $$invalidate(3, canDecrementMonth = $$props.canDecrementMonth);
        if ("monthsOfYear" in $$props) $$invalidate(4, monthsOfYear = $$props.monthsOfYear);
      };

      $$self.$$.update = () => {
        if ($$self.$$.dirty &
        /*start, year, end, monthsOfYear*/
        3090) {
           {
            let isOnLowerBoundary = start.getFullYear() === year;
            let isOnUpperBoundary = end.getFullYear() === year;
            $$invalidate(6, availableMonths = monthsOfYear.map((m, i) => {
              return Object.assign({}, {
                name: m[0],
                abbrev: m[1]
              }, {
                selectable: !isOnLowerBoundary && !isOnUpperBoundary || (!isOnLowerBoundary || i >= start.getMonth()) && (!isOnUpperBoundary || i <= end.getMonth())
              });
            }));
          }
        }
      };

      return [month, year, canIncrementMonth, canDecrementMonth, monthsOfYear, monthSelectorOpen, availableMonths, dispatch, toggleMonthSelectorOpen, monthSelected, start, end, click_handler, click_handler_1, click_handler_2];
    }

    class NavBar extends SvelteComponent {
      constructor(options) {
        super();
        init(this, options, instance$3, create_fragment$3, safe_not_equal, {
          month: 0,
          year: 1,
          start: 10,
          end: 11,
          canIncrementMonth: 2,
          canDecrementMonth: 3,
          monthsOfYear: 4
        });
      }

    }

    /* node_modules\svelte-calendar\src\Components\Popover.svelte generated by Svelte v3.38.3 */
    const {
      window: window_1
    } = globals;

    const get_contents_slot_changes = dirty => ({});

    const get_contents_slot_context = ctx => ({});

    const get_trigger_slot_changes = dirty => ({});

    const get_trigger_slot_context = ctx => ({});

    function create_fragment$4(ctx) {
      let div4;
      let div0;
      let t;
      let div3;
      let div2;
      let div1;
      let current;
      let mounted;
      let dispose;
      add_render_callback(
      /*onwindowresize*/
      ctx[14]);
      const trigger_slot_template =
      /*#slots*/
      ctx[13].trigger;
      const trigger_slot = create_slot(trigger_slot_template, ctx,
      /*$$scope*/
      ctx[12], get_trigger_slot_context);
      const contents_slot_template =
      /*#slots*/
      ctx[13].contents;
      const contents_slot = create_slot(contents_slot_template, ctx,
      /*$$scope*/
      ctx[12], get_contents_slot_context);
      return {
        c() {
          div4 = element("div");
          div0 = element("div");
          if (trigger_slot) trigger_slot.c();
          t = space();
          div3 = element("div");
          div2 = element("div");
          div1 = element("div");
          if (contents_slot) contents_slot.c();
          attr(div0, "class", "trigger");
          attr(div1, "class", "contents-inner svelte-1ijwk9o");
          attr(div2, "class", "contents svelte-1ijwk9o");
          attr(div3, "class", "contents-wrapper svelte-1ijwk9o");
          set_style(div3, "transform", "translate(-50%,-50%) translate(" +
          /*translateX*/
          ctx[8] + "px, " +
          /*translateY*/
          ctx[7] + "px)");
          toggle_class(div3, "visible",
          /*open*/
          ctx[0]);
          toggle_class(div3, "shrink",
          /*shrink*/
          ctx[1]);
          attr(div4, "class", "sc-popover svelte-1ijwk9o");
        },

        m(target, anchor) {
          insert(target, div4, anchor);
          append(div4, div0);

          if (trigger_slot) {
            trigger_slot.m(div0, null);
          }
          /*div0_binding*/


          ctx[15](div0);
          append(div4, t);
          append(div4, div3);
          append(div3, div2);
          append(div2, div1);

          if (contents_slot) {
            contents_slot.m(div1, null);
          }
          /*div2_binding*/


          ctx[16](div2);
          /*div3_binding*/

          ctx[17](div3);
          /*div4_binding*/

          ctx[18](div4);
          current = true;

          if (!mounted) {
            dispose = [listen(window_1, "resize",
            /*onwindowresize*/
            ctx[14]), listen(div0, "click",
            /*doOpen*/
            ctx[9])];
            mounted = true;
          }
        },

        p(ctx, [dirty]) {
          if (trigger_slot) {
            if (trigger_slot.p && (!current || dirty &
            /*$$scope*/
            4096)) {
              update_slot(trigger_slot, trigger_slot_template, ctx,
              /*$$scope*/
              ctx[12], !current ? -1 : dirty, get_trigger_slot_changes, get_trigger_slot_context);
            }
          }

          if (contents_slot) {
            if (contents_slot.p && (!current || dirty &
            /*$$scope*/
            4096)) {
              update_slot(contents_slot, contents_slot_template, ctx,
              /*$$scope*/
              ctx[12], !current ? -1 : dirty, get_contents_slot_changes, get_contents_slot_context);
            }
          }

          if (!current || dirty &
          /*translateX, translateY*/
          384) {
            set_style(div3, "transform", "translate(-50%,-50%) translate(" +
            /*translateX*/
            ctx[8] + "px, " +
            /*translateY*/
            ctx[7] + "px)");
          }

          if (dirty &
          /*open*/
          1) {
            toggle_class(div3, "visible",
            /*open*/
            ctx[0]);
          }

          if (dirty &
          /*shrink*/
          2) {
            toggle_class(div3, "shrink",
            /*shrink*/
            ctx[1]);
          }
        },

        i(local) {
          if (current) return;
          transition_in(trigger_slot, local);
          transition_in(contents_slot, local);
          current = true;
        },

        o(local) {
          transition_out(trigger_slot, local);
          transition_out(contents_slot, local);
          current = false;
        },

        d(detaching) {
          if (detaching) detach(div4);
          if (trigger_slot) trigger_slot.d(detaching);
          /*div0_binding*/

          ctx[15](null);
          if (contents_slot) contents_slot.d(detaching);
          /*div2_binding*/

          ctx[16](null);
          /*div3_binding*/

          ctx[17](null);
          /*div4_binding*/

          ctx[18](null);
          mounted = false;
          run_all(dispose);
        }

      };
    }

    function instance$4($$self, $$props, $$invalidate) {
      let {
        $$slots: slots = {},
        $$scope
      } = $$props;
      const dispatch = createEventDispatcher();

      let once = (el, evt, cb) => {
        function handler() {
          cb.apply(this, arguments);
          el.removeEventListener(evt, handler);
        }

        el.addEventListener(evt, handler);
      };

      let popover;
      let w;
      let triggerContainer;
      let contentsAnimated;
      let contentsWrapper;
      let translateY = 0;
      let translateX = 0;
      let {
        open = false
      } = $$props;
      let {
        shrink
      } = $$props;
      let {
        trigger
      } = $$props;

      const close = () => {
        $$invalidate(1, shrink = true);
        once(contentsAnimated, "animationend", () => {
          $$invalidate(1, shrink = false);
          $$invalidate(0, open = false);
          dispatch("closed");
        });
      };

      function checkForFocusLoss(evt) {
        if (!open) return;
        let el = evt.target; // eslint-disable-next-line

        do {
          if (el === popover) return;
        } while (el = el.parentNode); // eslint-disable-next-line


        close();
      }

      onMount(() => {
        document.addEventListener("click", checkForFocusLoss);
        if (!trigger) return;
        triggerContainer.appendChild(trigger.parentNode.removeChild(trigger)); // eslint-disable-next-line

        return () => {
          document.removeEventListener("click", checkForFocusLoss);
        };
      });

      const getDistanceToEdges = async () => {
        if (!open) {
          $$invalidate(0, open = true);
        }

        await tick();
        let rect = contentsWrapper.getBoundingClientRect();
        return {
          top: rect.top + -1 * translateY,
          bottom: window.innerHeight - rect.bottom + translateY,
          left: rect.left + -1 * translateX,
          right: document.body.clientWidth - rect.right + translateX
        };
      };

      const getTranslate = async () => {
        let dist = await getDistanceToEdges();
        let x;
        let y;

        if (w < 480) {
          y = dist.bottom;
        } else if (dist.top < 0) {
          y = Math.abs(dist.top);
        } else if (dist.bottom < 0) {
          y = dist.bottom;
        } else {
          y = 0;
        }

        if (dist.left < 0) {
          x = Math.abs(dist.left);
        } else if (dist.right < 0) {
          x = dist.right;
        } else {
          x = 0;
        }

        return {
          x,
          y
        };
      };

      const doOpen = async () => {
        const {
          x,
          y
        } = await getTranslate();
        $$invalidate(8, translateX = x);
        $$invalidate(7, translateY = y);
        $$invalidate(0, open = true);
        dispatch("opened");
      };

      function onwindowresize() {
        $$invalidate(3, w = window_1.innerWidth);
      }

      function div0_binding($$value) {
        binding_callbacks[$$value ? "unshift" : "push"](() => {
          triggerContainer = $$value;
          $$invalidate(4, triggerContainer);
        });
      }

      function div2_binding($$value) {
        binding_callbacks[$$value ? "unshift" : "push"](() => {
          contentsAnimated = $$value;
          $$invalidate(5, contentsAnimated);
        });
      }

      function div3_binding($$value) {
        binding_callbacks[$$value ? "unshift" : "push"](() => {
          contentsWrapper = $$value;
          $$invalidate(6, contentsWrapper);
        });
      }

      function div4_binding($$value) {
        binding_callbacks[$$value ? "unshift" : "push"](() => {
          popover = $$value;
          $$invalidate(2, popover);
        });
      }

      $$self.$$set = $$props => {
        if ("open" in $$props) $$invalidate(0, open = $$props.open);
        if ("shrink" in $$props) $$invalidate(1, shrink = $$props.shrink);
        if ("trigger" in $$props) $$invalidate(10, trigger = $$props.trigger);
        if ("$$scope" in $$props) $$invalidate(12, $$scope = $$props.$$scope);
      };

      return [open, shrink, popover, w, triggerContainer, contentsAnimated, contentsWrapper, translateY, translateX, doOpen, trigger, close, $$scope, slots, onwindowresize, div0_binding, div2_binding, div3_binding, div4_binding];
    }

    class Popover extends SvelteComponent {
      constructor(options) {
        super();
        init(this, options, instance$4, create_fragment$4, safe_not_equal, {
          open: 0,
          shrink: 1,
          trigger: 10,
          close: 11
        });
      }

      get close() {
        return this.$$.ctx[11];
      }

    }

    /**
     * generic function to inject data into token-laden string
     * @param str {String} Required
     * @param name {String} Required
     * @param value {String|Integer} Required
     * @returns {String}
     *
     * @example
     * injectStringData("The following is a token: #{tokenName}", "tokenName", 123); 
     * @returns {String} "The following is a token: 123"
     *
     */
    const injectStringData = (str, name, value) => str.replace(new RegExp('#{' + name + '}', 'g'), value);
    /**
     * Generic function to enforce length of string. 
     * 
     * Pass a string or number to this function and specify the desired length.
     * This function will either pad the # with leading 0's (if str.length < length)
     * or remove data from the end (@fromBack==false) or beginning (@fromBack==true)
     * of the string when str.length > length.
     *
     * When length == str.length or typeof length == 'undefined', this function
     * returns the original @str parameter.
     * 
     * @param str {String} Required
     * @param length {Integer} Required
     * @param fromBack {Boolean} Optional
     * @returns {String}
     *
     */


    const enforceLength = function (str, length, fromBack) {
      str = str.toString();
      if (typeof length == 'undefined') return str;
      if (str.length == length) return str;
      fromBack = typeof fromBack == 'undefined' ? false : fromBack;

      if (str.length < length) {
        // pad the beginning of the string w/ enough 0's to reach desired length:
        while (length - str.length > 0) str = '0' + str;
      } else if (str.length > length) {
        if (fromBack) {
          // grab the desired #/chars from end of string: ex: '2015' -> '15'
          str = str.substring(str.length - length);
        } else {
          // grab the desired #/chars from beginning of string: ex: '2015' -> '20'
          str = str.substring(0, length);
        }
      }

      return str;
    };

    const daysOfWeek = [['Sunday', 'Sun'], ['Monday', 'Mon'], ['Tuesday', 'Tue'], ['Wednesday', 'Wed'], ['Thursday', 'Thu'], ['Friday', 'Fri'], ['Saturday', 'Sat']];
    const monthsOfYear = [['January', 'Jan'], ['February', 'Feb'], ['March', 'Mar'], ['April', 'Apr'], ['May', 'May'], ['June', 'Jun'], ['July', 'Jul'], ['August', 'Aug'], ['September', 'Sep'], ['October', 'Oct'], ['November', 'Nov'], ['December', 'Dec']];
    let dictionary = {
      daysOfWeek,
      monthsOfYear
    };

    const extendDictionary = conf => Object.keys(conf).forEach(key => {
      if (dictionary[key] && dictionary[key].length == conf[key].length) {
        dictionary[key] = conf[key];
      }
    });

    var acceptedDateTokens = [{
      // d: day of the month, 2 digits with leading zeros:
      key: 'd',
      method: function (date) {
        return enforceLength(date.getDate(), 2);
      }
    }, {
      // D: textual representation of day, 3 letters: Sun thru Sat
      key: 'D',
      method: function (date) {
        return dictionary.daysOfWeek[date.getDay()][1];
      }
    }, {
      // j: day of month without leading 0's
      key: 'j',
      method: function (date) {
        return date.getDate();
      }
    }, {
      // l: full textual representation of day of week: Sunday thru Saturday
      key: 'l',
      method: function (date) {
        return dictionary.daysOfWeek[date.getDay()][0];
      }
    }, {
      // F: full text month: 'January' thru 'December'
      key: 'F',
      method: function (date) {
        return dictionary.monthsOfYear[date.getMonth()][0];
      }
    }, {
      // m: 2 digit numeric month: '01' - '12':
      key: 'm',
      method: function (date) {
        return enforceLength(date.getMonth() + 1, 2);
      }
    }, {
      // M: a short textual representation of the month, 3 letters: 'Jan' - 'Dec'
      key: 'M',
      method: function (date) {
        return dictionary.monthsOfYear[date.getMonth()][1];
      }
    }, {
      // n: numeric represetation of month w/o leading 0's, '1' - '12':
      key: 'n',
      method: function (date) {
        return date.getMonth() + 1;
      }
    }, {
      // Y: Full numeric year, 4 digits
      key: 'Y',
      method: function (date) {
        return date.getFullYear();
      }
    }, {
      // y: 2 digit numeric year:
      key: 'y',
      method: function (date) {
        return enforceLength(date.getFullYear(), 2, true);
      }
    }];
    var acceptedTimeTokens = [{
      // a: lowercase ante meridiem and post meridiem 'am' or 'pm'
      key: 'a',
      method: function (date) {
        return date.getHours() > 11 ? 'pm' : 'am';
      }
    }, {
      // A: uppercase ante merdiiem and post meridiem 'AM' or 'PM'
      key: 'A',
      method: function (date) {
        return date.getHours() > 11 ? 'PM' : 'AM';
      }
    }, {
      // g: 12-hour format of an hour without leading zeros 1-12
      key: 'g',
      method: function (date) {
        return date.getHours() % 12 || 12;
      }
    }, {
      // G: 24-hour format of an hour without leading zeros 0-23
      key: 'G',
      method: function (date) {
        return date.getHours();
      }
    }, {
      // h: 12-hour format of an hour with leading zeros 01-12
      key: 'h',
      method: function (date) {
        return enforceLength(date.getHours() % 12 || 12, 2);
      }
    }, {
      // H: 24-hour format of an hour with leading zeros: 00-23
      key: 'H',
      method: function (date) {
        return enforceLength(date.getHours(), 2);
      }
    }, {
      // i: Minutes with leading zeros 00-59
      key: 'i',
      method: function (date) {
        return enforceLength(date.getMinutes(), 2);
      }
    }, {
      // s: Seconds with leading zeros 00-59
      key: 's',
      method: function (date) {
        return enforceLength(date.getSeconds(), 2);
      }
    }];
    /**
     * Internationalization object for timeUtils.internationalize().
     * @typedef internationalizeObj
     * @property {Array} [daysOfWeek=[ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ]] daysOfWeek Weekday labels as strings, starting with Sunday.
     * @property {Array} [monthsOfYear=[ 'January','February','March','April','May','June','July','August','September','October','November','December' ]] monthsOfYear Month labels as strings, starting with January.
     */

    /**
     * This function can be used to support additional languages by passing an object with 
     * `daysOfWeek` and `monthsOfYear` attributes.  Each attribute should be an array of
     * strings (ex: `daysOfWeek: ['monday', 'tuesday', 'wednesday'...]`)
     *
     * @param {internationalizeObj} conf
     */

    const internationalize = (conf = {}) => {
      extendDictionary(conf);
    };
    /**
     * generic formatDate function which accepts dynamic templates
     * @param date {Date} Required
     * @param template {String} Optional
     * @returns {String}
     *
     * @example
     * formatDate(new Date(), '#{M}. #{j}, #{Y}')
     * @returns {Number} Returns a formatted date
     *
     */


    const formatDate = (date, template = '#{m}/#{d}/#{Y}') => {
      acceptedDateTokens.forEach(token => {
        if (template.indexOf(`#{${token.key}}`) == -1) return;
        template = injectStringData(template, token.key, token.method(date));
      });
      acceptedTimeTokens.forEach(token => {
        if (template.indexOf(`#{${token.key}}`) == -1) return;
        template = injectStringData(template, token.key, token.method(date));
      });
      return template;
    };

    const keyCodes = {
      left: 37,
      up: 38,
      right: 39,
      down: 40,
      pgup: 33,
      pgdown: 34,
      enter: 13,
      escape: 27,
      tab: 9
    };
    const keyCodesArray = Object.keys(keyCodes).map(k => keyCodes[k]);

    /* node_modules\svelte-calendar\src\Components\Datepicker.svelte generated by Svelte v3.38.3 */

    const get_default_slot_changes$1 = dirty => ({
      selected: dirty[0] &
      /*selected*/
      1,
      formattedSelected: dirty[0] &
      /*formattedSelected*/
      4
    });

    const get_default_slot_context$1 = ctx => ({
      selected:
      /*selected*/
      ctx[0],
      formattedSelected:
      /*formattedSelected*/
      ctx[2]
    });

    function get_each_context$4(ctx, list, i) {
      const child_ctx = ctx.slice();
      child_ctx[62] = list[i];
      return child_ctx;
    } // (272:8) {#if !trigger}


    function create_if_block$1(ctx) {
      let button;
      let t;
      return {
        c() {
          button = element("button");
          t = text(
          /*formattedSelected*/
          ctx[2]);
          attr(button, "class", "calendar-button svelte-1f52d23");
          attr(button, "type", "button");
        },

        m(target, anchor) {
          insert(target, button, anchor);
          append(button, t);
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*formattedSelected*/
          4) set_data(t,
          /*formattedSelected*/
          ctx[2]);
        },

        d(detaching) {
          if (detaching) detach(button);
        }

      };
    } // (271:43)          


    function fallback_block$1(ctx) {
      let if_block_anchor;
      let if_block = !
      /*trigger*/
      ctx[1] && create_if_block$1(ctx);
      return {
        c() {
          if (if_block) if_block.c();
          if_block_anchor = empty();
        },

        m(target, anchor) {
          if (if_block) if_block.m(target, anchor);
          insert(target, if_block_anchor, anchor);
        },

        p(ctx, dirty) {
          if (!
          /*trigger*/
          ctx[1]) {
            if (if_block) {
              if_block.p(ctx, dirty);
            } else {
              if_block = create_if_block$1(ctx);
              if_block.c();
              if_block.m(if_block_anchor.parentNode, if_block_anchor);
            }
          } else if (if_block) {
            if_block.d(1);
            if_block = null;
          }
        },

        d(detaching) {
          if (if_block) if_block.d(detaching);
          if (detaching) detach(if_block_anchor);
        }

      };
    } // (270:4) 


    function create_trigger_slot(ctx) {
      let div;
      let current;
      const default_slot_template =
      /*#slots*/
      ctx[40].default;
      const default_slot = create_slot(default_slot_template, ctx,
      /*$$scope*/
      ctx[47], get_default_slot_context$1);
      const default_slot_or_fallback = default_slot || fallback_block$1(ctx);
      return {
        c() {
          div = element("div");
          if (default_slot_or_fallback) default_slot_or_fallback.c();
          attr(div, "slot", "trigger");
          attr(div, "class", "svelte-1f52d23");
        },

        m(target, anchor) {
          insert(target, div, anchor);

          if (default_slot_or_fallback) {
            default_slot_or_fallback.m(div, null);
          }

          current = true;
        },

        p(ctx, dirty) {
          if (default_slot) {
            if (default_slot.p && (!current || dirty[0] &
            /*selected, formattedSelected*/
            5 | dirty[1] &
            /*$$scope*/
            65536)) {
              update_slot(default_slot, default_slot_template, ctx,
              /*$$scope*/
              ctx[47], !current ? [-1, -1, -1] : dirty, get_default_slot_changes$1, get_default_slot_context$1);
            }
          } else {
            if (default_slot_or_fallback && default_slot_or_fallback.p && (!current || dirty[0] &
            /*formattedSelected, trigger*/
            6)) {
              default_slot_or_fallback.p(ctx, !current ? [-1, -1, -1] : dirty);
            }
          }
        },

        i(local) {
          if (current) return;
          transition_in(default_slot_or_fallback, local);
          current = true;
        },

        o(local) {
          transition_out(default_slot_or_fallback, local);
          current = false;
        },

        d(detaching) {
          if (detaching) detach(div);
          if (default_slot_or_fallback) default_slot_or_fallback.d(detaching);
        }

      };
    } // (293:10) {#each sortedDaysOfWeek as day}


    function create_each_block$4(ctx) {
      let span;
      let t_value =
      /*day*/
      ctx[62][1] + "";
      let t;
      return {
        c() {
          span = element("span");
          t = text(t_value);
          attr(span, "class", "svelte-1f52d23");
        },

        m(target, anchor) {
          insert(target, span, anchor);
          append(span, t);
        },

        p: noop,

        d(detaching) {
          if (detaching) detach(span);
        }

      };
    } // (279:4) 


    function create_contents_slot(ctx) {
      let div2;
      let div1;
      let navbar;
      let t0;
      let div0;
      let t1;
      let month_1;
      let current;
      navbar = new NavBar({
        props: {
          month:
          /*month*/
          ctx[6],
          year:
          /*year*/
          ctx[7],
          canIncrementMonth:
          /*canIncrementMonth*/
          ctx[15],
          canDecrementMonth:
          /*canDecrementMonth*/
          ctx[16],
          start:
          /*start*/
          ctx[3],
          end:
          /*end*/
          ctx[4],
          monthsOfYear:
          /*monthsOfYear*/
          ctx[5]
        }
      });
      navbar.$on("monthSelected",
      /*monthSelected_handler*/
      ctx[41]);
      navbar.$on("incrementMonth",
      /*incrementMonth_handler*/
      ctx[42]);
      let each_value =
      /*sortedDaysOfWeek*/
      ctx[18];
      let each_blocks = [];

      for (let i = 0; i < each_value.length; i += 1) {
        each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
      }

      month_1 = new Month({
        props: {
          visibleMonth:
          /*visibleMonth*/
          ctx[8],
          selected:
          /*selected*/
          ctx[0],
          highlighted:
          /*highlighted*/
          ctx[10],
          shouldShakeDate:
          /*shouldShakeDate*/
          ctx[11],
          id:
          /*visibleMonthId*/
          ctx[14]
        }
      });
      month_1.$on("dateSelected",
      /*dateSelected_handler*/
      ctx[43]);
      return {
        c() {
          div2 = element("div");
          div1 = element("div");
          create_component(navbar.$$.fragment);
          t0 = space();
          div0 = element("div");

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].c();
          }

          t1 = space();
          create_component(month_1.$$.fragment);
          attr(div0, "class", "legend svelte-1f52d23");
          attr(div1, "class", "calendar svelte-1f52d23");
          attr(div2, "slot", "contents");
          attr(div2, "class", "svelte-1f52d23");
        },

        m(target, anchor) {
          insert(target, div2, anchor);
          append(div2, div1);
          mount_component(navbar, div1, null);
          append(div1, t0);
          append(div1, div0);

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].m(div0, null);
          }

          append(div1, t1);
          mount_component(month_1, div1, null);
          current = true;
        },

        p(ctx, dirty) {
          const navbar_changes = {};
          if (dirty[0] &
          /*month*/
          64) navbar_changes.month =
          /*month*/
          ctx[6];
          if (dirty[0] &
          /*year*/
          128) navbar_changes.year =
          /*year*/
          ctx[7];
          if (dirty[0] &
          /*canIncrementMonth*/
          32768) navbar_changes.canIncrementMonth =
          /*canIncrementMonth*/
          ctx[15];
          if (dirty[0] &
          /*canDecrementMonth*/
          65536) navbar_changes.canDecrementMonth =
          /*canDecrementMonth*/
          ctx[16];
          if (dirty[0] &
          /*start*/
          8) navbar_changes.start =
          /*start*/
          ctx[3];
          if (dirty[0] &
          /*end*/
          16) navbar_changes.end =
          /*end*/
          ctx[4];
          if (dirty[0] &
          /*monthsOfYear*/
          32) navbar_changes.monthsOfYear =
          /*monthsOfYear*/
          ctx[5];
          navbar.$set(navbar_changes);

          if (dirty[0] &
          /*sortedDaysOfWeek*/
          262144) {
            each_value =
            /*sortedDaysOfWeek*/
            ctx[18];
            let i;

            for (i = 0; i < each_value.length; i += 1) {
              const child_ctx = get_each_context$4(ctx, each_value, i);

              if (each_blocks[i]) {
                each_blocks[i].p(child_ctx, dirty);
              } else {
                each_blocks[i] = create_each_block$4(child_ctx);
                each_blocks[i].c();
                each_blocks[i].m(div0, null);
              }
            }

            for (; i < each_blocks.length; i += 1) {
              each_blocks[i].d(1);
            }

            each_blocks.length = each_value.length;
          }

          const month_1_changes = {};
          if (dirty[0] &
          /*visibleMonth*/
          256) month_1_changes.visibleMonth =
          /*visibleMonth*/
          ctx[8];
          if (dirty[0] &
          /*selected*/
          1) month_1_changes.selected =
          /*selected*/
          ctx[0];
          if (dirty[0] &
          /*highlighted*/
          1024) month_1_changes.highlighted =
          /*highlighted*/
          ctx[10];
          if (dirty[0] &
          /*shouldShakeDate*/
          2048) month_1_changes.shouldShakeDate =
          /*shouldShakeDate*/
          ctx[11];
          if (dirty[0] &
          /*visibleMonthId*/
          16384) month_1_changes.id =
          /*visibleMonthId*/
          ctx[14];
          month_1.$set(month_1_changes);
        },

        i(local) {
          if (current) return;
          transition_in(navbar.$$.fragment, local);
          transition_in(month_1.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(navbar.$$.fragment, local);
          transition_out(month_1.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          if (detaching) detach(div2);
          destroy_component(navbar);
          destroy_each(each_blocks, detaching);
          destroy_component(month_1);
        }

      };
    }

    function create_fragment$5(ctx) {
      let div;
      let popover_1;
      let updating_open;
      let updating_shrink;
      let current;

      function popover_1_open_binding(value) {
        /*popover_1_open_binding*/
        ctx[45](value);
      }

      function popover_1_shrink_binding(value) {
        /*popover_1_shrink_binding*/
        ctx[46](value);
      }

      let popover_1_props = {
        trigger:
        /*trigger*/
        ctx[1],
        $$slots: {
          contents: [create_contents_slot],
          trigger: [create_trigger_slot]
        },
        $$scope: {
          ctx
        }
      };

      if (
      /*isOpen*/
      ctx[12] !== void 0) {
        popover_1_props.open =
        /*isOpen*/
        ctx[12];
      }

      if (
      /*isClosing*/
      ctx[13] !== void 0) {
        popover_1_props.shrink =
        /*isClosing*/
        ctx[13];
      }

      popover_1 = new Popover({
        props: popover_1_props
      });
      /*popover_1_binding*/

      ctx[44](popover_1);
      binding_callbacks.push(() => bind(popover_1, "open", popover_1_open_binding));
      binding_callbacks.push(() => bind(popover_1, "shrink", popover_1_shrink_binding));
      popover_1.$on("opened",
      /*registerOpen*/
      ctx[23]);
      popover_1.$on("closed",
      /*registerClose*/
      ctx[22]);
      return {
        c() {
          div = element("div");
          create_component(popover_1.$$.fragment);
          attr(div, "class", "datepicker svelte-1f52d23");
          attr(div, "style",
          /*wrapperStyle*/
          ctx[17]);
          toggle_class(div, "open",
          /*isOpen*/
          ctx[12]);
          toggle_class(div, "closing",
          /*isClosing*/
          ctx[13]);
        },

        m(target, anchor) {
          insert(target, div, anchor);
          mount_component(popover_1, div, null);
          current = true;
        },

        p(ctx, dirty) {
          const popover_1_changes = {};
          if (dirty[0] &
          /*trigger*/
          2) popover_1_changes.trigger =
          /*trigger*/
          ctx[1];

          if (dirty[0] &
          /*visibleMonth, selected, highlighted, shouldShakeDate, visibleMonthId, month, year, canIncrementMonth, canDecrementMonth, start, end, monthsOfYear, formattedSelected, trigger*/
          118271 | dirty[1] &
          /*$$scope*/
          65536) {
            popover_1_changes.$$scope = {
              dirty,
              ctx
            };
          }

          if (!updating_open && dirty[0] &
          /*isOpen*/
          4096) {
            updating_open = true;
            popover_1_changes.open =
            /*isOpen*/
            ctx[12];
            add_flush_callback(() => updating_open = false);
          }

          if (!updating_shrink && dirty[0] &
          /*isClosing*/
          8192) {
            updating_shrink = true;
            popover_1_changes.shrink =
            /*isClosing*/
            ctx[13];
            add_flush_callback(() => updating_shrink = false);
          }

          popover_1.$set(popover_1_changes);

          if (!current || dirty[0] &
          /*wrapperStyle*/
          131072) {
            attr(div, "style",
            /*wrapperStyle*/
            ctx[17]);
          }

          if (dirty[0] &
          /*isOpen*/
          4096) {
            toggle_class(div, "open",
            /*isOpen*/
            ctx[12]);
          }

          if (dirty[0] &
          /*isClosing*/
          8192) {
            toggle_class(div, "closing",
            /*isClosing*/
            ctx[13]);
          }
        },

        i(local) {
          if (current) return;
          transition_in(popover_1.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(popover_1.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          if (detaching) detach(div);
          /*popover_1_binding*/

          ctx[44](null);
          destroy_component(popover_1);
        }

      };
    }

    function instance$5($$self, $$props, $$invalidate) {
      let months;
      let visibleMonth;
      let visibleMonthId;
      let lastVisibleDate;
      let firstVisibleDate;
      let canIncrementMonth;
      let canDecrementMonth;
      let wrapperStyle;
      let {
        $$slots: slots = {},
        $$scope
      } = $$props;
      const dispatch = createEventDispatcher();
      const today = new Date();
      let popover;
      let {
        format = "#{m}/#{d}/#{Y}"
      } = $$props;
      let {
        start = new Date(1987, 9, 29)
      } = $$props;
      let {
        end = new Date(2020, 9, 29)
      } = $$props;
      let {
        selected = today
      } = $$props;
      let {
        dateChosen = false
      } = $$props;
      let {
        trigger = null
      } = $$props;
      let {
        selectableCallback = null
      } = $$props;
      let {
        weekStart = 0
      } = $$props;
      let {
        daysOfWeek = [["Sunday", "Sun"], ["Monday", "Mon"], ["Tuesday", "Tue"], ["Wednesday", "Wed"], ["Thursday", "Thu"], ["Friday", "Fri"], ["Saturday", "Sat"]]
      } = $$props;
      let {
        monthsOfYear = [["January", "Jan"], ["February", "Feb"], ["March", "Mar"], ["April", "Apr"], ["May", "May"], ["June", "Jun"], ["July", "Jul"], ["August", "Aug"], ["September", "Sep"], ["October", "Oct"], ["November", "Nov"], ["December", "Dec"]]
      } = $$props;
      let {
        style = ""
      } = $$props;
      let {
        buttonBackgroundColor = "#fff"
      } = $$props;
      let {
        buttonBorderColor = "#eee"
      } = $$props;
      let {
        buttonTextColor = "#333"
      } = $$props;
      let {
        highlightColor = "#f7901e"
      } = $$props;
      let {
        dayBackgroundColor = "none"
      } = $$props;
      let {
        dayTextColor = "#4a4a4a"
      } = $$props;
      let {
        dayHighlightedBackgroundColor = "#efefef"
      } = $$props;
      let {
        dayHighlightedTextColor = "#4a4a4a"
      } = $$props;
      internationalize({
        daysOfWeek,
        monthsOfYear
      });
      let sortedDaysOfWeek = weekStart === 0 ? daysOfWeek : (() => {
        let dow = daysOfWeek.slice();
        dow.push(dow.shift());
        return dow;
      })();
      let highlighted = today;
      let shouldShakeDate = false;
      let shakeHighlightTimeout;
      let month = today.getMonth();
      let year = today.getFullYear();
      let isOpen = false;
      let isClosing = false;
      today.setHours(0, 0, 0, 0);

      function assignmentHandler(formatted) {
        if (!trigger) return;
        $$invalidate(1, trigger.innerHTML = formatted, trigger);
      }

      let monthIndex = 0;
      let {
        formattedSelected
      } = $$props;
      onMount(() => {
        $$invalidate(6, month = selected.getMonth());
        $$invalidate(7, year = selected.getFullYear());
      });

      function changeMonth(selectedMonth) {
        $$invalidate(6, month = selectedMonth);
        $$invalidate(10, highlighted = new Date(year, month, 1));
      }

      function incrementMonth(direction, day = 1) {
        if (direction === 1 && !canIncrementMonth) return;
        if (direction === -1 && !canDecrementMonth) return;
        let current = new Date(year, month, 1);
        current.setMonth(current.getMonth() + direction);
        $$invalidate(6, month = current.getMonth());
        $$invalidate(7, year = current.getFullYear());
        $$invalidate(10, highlighted = new Date(year, month, day));
      }

      function getDefaultHighlighted() {
        return new Date(selected);
      }

      const getDay = (m, d, y) => {
        let theMonth = months.find(aMonth => aMonth.month === m && aMonth.year === y);
        if (!theMonth) return null; // eslint-disable-next-line

        for (let i = 0; i < theMonth.weeks.length; ++i) {
          // eslint-disable-next-line
          for (let j = 0; j < theMonth.weeks[i].days.length; ++j) {
            let aDay = theMonth.weeks[i].days[j];
            if (aDay.month === m && aDay.day === d && aDay.year === y) return aDay;
          }
        }

        return null;
      };

      function incrementDayHighlighted(amount) {
        let proposedDate = new Date(highlighted);
        proposedDate.setDate(highlighted.getDate() + amount);
        let correspondingDayObj = getDay(proposedDate.getMonth(), proposedDate.getDate(), proposedDate.getFullYear());
        if (!correspondingDayObj || !correspondingDayObj.isInRange) return;
        $$invalidate(10, highlighted = proposedDate);

        if (amount > 0 && highlighted > lastVisibleDate) {
          incrementMonth(1, highlighted.getDate());
        }

        if (amount < 0 && highlighted < firstVisibleDate) {
          incrementMonth(-1, highlighted.getDate());
        }
      }

      function checkIfVisibleDateIsSelectable(date) {
        const proposedDay = getDay(date.getMonth(), date.getDate(), date.getFullYear());
        return proposedDay && proposedDay.selectable;
      }

      function shakeDate(date) {
        clearTimeout(shakeHighlightTimeout);
        $$invalidate(11, shouldShakeDate = date);
        shakeHighlightTimeout = setTimeout(() => {
          $$invalidate(11, shouldShakeDate = false);
        }, 700);
      }

      function assignValueToTrigger(formatted) {
        assignmentHandler(formatted);
      }

      function registerSelection(chosen) {
        if (!checkIfVisibleDateIsSelectable(chosen)) return shakeDate(chosen); // eslint-disable-next-line

        close();
        $$invalidate(0, selected = chosen);
        $$invalidate(24, dateChosen = true);
        assignValueToTrigger(formattedSelected);
        return dispatch("dateSelected", {
          date: chosen
        });
      }

      function handleKeyPress(evt) {
        if (keyCodesArray.indexOf(evt.keyCode) === -1) return;
        evt.preventDefault();

        switch (evt.keyCode) {
          case keyCodes.left:
            incrementDayHighlighted(-1);
            break;

          case keyCodes.up:
            incrementDayHighlighted(-7);
            break;

          case keyCodes.right:
            incrementDayHighlighted(1);
            break;

          case keyCodes.down:
            incrementDayHighlighted(7);
            break;

          case keyCodes.pgup:
            incrementMonth(-1);
            break;

          case keyCodes.pgdown:
            incrementMonth(1);
            break;

          case keyCodes.escape:
            // eslint-disable-next-line
            close();
            break;

          case keyCodes.enter:
            registerSelection(highlighted);
            break;
        }
      }

      function registerClose() {
        document.removeEventListener("keydown", handleKeyPress);
        dispatch("close");
      }

      function close() {
        popover.close();
        registerClose();
      }

      function registerOpen() {
        $$invalidate(10, highlighted = getDefaultHighlighted());
        $$invalidate(6, month = selected.getMonth());
        $$invalidate(7, year = selected.getFullYear());
        document.addEventListener("keydown", handleKeyPress);
        dispatch("open");
      }

      const monthSelected_handler = e => changeMonth(e.detail);

      const incrementMonth_handler = e => incrementMonth(e.detail);

      const dateSelected_handler = e => registerSelection(e.detail);

      function popover_1_binding($$value) {
        binding_callbacks[$$value ? "unshift" : "push"](() => {
          popover = $$value;
          $$invalidate(9, popover);
        });
      }

      function popover_1_open_binding(value) {
        isOpen = value;
        $$invalidate(12, isOpen);
      }

      function popover_1_shrink_binding(value) {
        isClosing = value;
        $$invalidate(13, isClosing);
      }

      $$self.$$set = $$props => {
        if ("format" in $$props) $$invalidate(25, format = $$props.format);
        if ("start" in $$props) $$invalidate(3, start = $$props.start);
        if ("end" in $$props) $$invalidate(4, end = $$props.end);
        if ("selected" in $$props) $$invalidate(0, selected = $$props.selected);
        if ("dateChosen" in $$props) $$invalidate(24, dateChosen = $$props.dateChosen);
        if ("trigger" in $$props) $$invalidate(1, trigger = $$props.trigger);
        if ("selectableCallback" in $$props) $$invalidate(26, selectableCallback = $$props.selectableCallback);
        if ("weekStart" in $$props) $$invalidate(27, weekStart = $$props.weekStart);
        if ("daysOfWeek" in $$props) $$invalidate(28, daysOfWeek = $$props.daysOfWeek);
        if ("monthsOfYear" in $$props) $$invalidate(5, monthsOfYear = $$props.monthsOfYear);
        if ("style" in $$props) $$invalidate(29, style = $$props.style);
        if ("buttonBackgroundColor" in $$props) $$invalidate(30, buttonBackgroundColor = $$props.buttonBackgroundColor);
        if ("buttonBorderColor" in $$props) $$invalidate(31, buttonBorderColor = $$props.buttonBorderColor);
        if ("buttonTextColor" in $$props) $$invalidate(32, buttonTextColor = $$props.buttonTextColor);
        if ("highlightColor" in $$props) $$invalidate(33, highlightColor = $$props.highlightColor);
        if ("dayBackgroundColor" in $$props) $$invalidate(34, dayBackgroundColor = $$props.dayBackgroundColor);
        if ("dayTextColor" in $$props) $$invalidate(35, dayTextColor = $$props.dayTextColor);
        if ("dayHighlightedBackgroundColor" in $$props) $$invalidate(36, dayHighlightedBackgroundColor = $$props.dayHighlightedBackgroundColor);
        if ("dayHighlightedTextColor" in $$props) $$invalidate(37, dayHighlightedTextColor = $$props.dayHighlightedTextColor);
        if ("formattedSelected" in $$props) $$invalidate(2, formattedSelected = $$props.formattedSelected);
        if ("$$scope" in $$props) $$invalidate(47, $$scope = $$props.$$scope);
      };

      $$self.$$.update = () => {
        if ($$self.$$.dirty[0] &
        /*start, end, selectableCallback, weekStart*/
        201326616) {
           $$invalidate(39, months = getMonths(start, end, selectableCallback, weekStart));
        }

        if ($$self.$$.dirty[0] &
        /*month, year*/
        192 | $$self.$$.dirty[1] &
        /*months*/
        256) {
           {
            $$invalidate(38, monthIndex = 0);

            for (let i = 0; i < months.length; i += 1) {
              if (months[i].month === month && months[i].year === year) {
                $$invalidate(38, monthIndex = i);
              }
            }
          }
        }

        if ($$self.$$.dirty[1] &
        /*months, monthIndex*/
        384) {
           $$invalidate(8, visibleMonth = months[monthIndex]);
        }

        if ($$self.$$.dirty[0] &
        /*year, month*/
        192) {
           $$invalidate(14, visibleMonthId = year + month / 100);
        }

        if ($$self.$$.dirty[0] &
        /*visibleMonth*/
        256) {
           lastVisibleDate = visibleMonth.weeks[visibleMonth.weeks.length - 1].days[6].date;
        }

        if ($$self.$$.dirty[0] &
        /*visibleMonth*/
        256) {
           firstVisibleDate = visibleMonth.weeks[0].days[0].date;
        }

        if ($$self.$$.dirty[1] &
        /*monthIndex, months*/
        384) {
           $$invalidate(15, canIncrementMonth = monthIndex < months.length - 1);
        }

        if ($$self.$$.dirty[1] &
        /*monthIndex*/
        128) {
           $$invalidate(16, canDecrementMonth = monthIndex > 0);
        }

        if ($$self.$$.dirty[0] &
        /*buttonBackgroundColor, style*/
        1610612736 | $$self.$$.dirty[1] &
        /*buttonBorderColor, buttonTextColor, highlightColor, dayBackgroundColor, dayTextColor, dayHighlightedBackgroundColor, dayHighlightedTextColor*/
        127) {
           $$invalidate(17, wrapperStyle = `
    --button-background-color: ${buttonBackgroundColor};
    --button-border-color: ${buttonBorderColor};
    --button-text-color: ${buttonTextColor};
    --highlight-color: ${highlightColor};
    --day-background-color: ${dayBackgroundColor};
    --day-text-color: ${dayTextColor};
    --day-highlighted-background-color: ${dayHighlightedBackgroundColor};
    --day-highlighted-text-color: ${dayHighlightedTextColor};
    ${style}
  `);
        }

        if ($$self.$$.dirty[0] &
        /*format, selected*/
        33554433) {
           {
            $$invalidate(2, formattedSelected = typeof format === "function" ? format(selected) : formatDate(selected, format));
          }
        }
      };

      return [selected, trigger, formattedSelected, start, end, monthsOfYear, month, year, visibleMonth, popover, highlighted, shouldShakeDate, isOpen, isClosing, visibleMonthId, canIncrementMonth, canDecrementMonth, wrapperStyle, sortedDaysOfWeek, changeMonth, incrementMonth, registerSelection, registerClose, registerOpen, dateChosen, format, selectableCallback, weekStart, daysOfWeek, style, buttonBackgroundColor, buttonBorderColor, buttonTextColor, highlightColor, dayBackgroundColor, dayTextColor, dayHighlightedBackgroundColor, dayHighlightedTextColor, monthIndex, months, slots, monthSelected_handler, incrementMonth_handler, dateSelected_handler, popover_1_binding, popover_1_open_binding, popover_1_shrink_binding, $$scope];
    }

    class Datepicker extends SvelteComponent {
      constructor(options) {
        super();
        init(this, options, instance$5, create_fragment$5, safe_not_equal, {
          format: 25,
          start: 3,
          end: 4,
          selected: 0,
          dateChosen: 24,
          trigger: 1,
          selectableCallback: 26,
          weekStart: 27,
          daysOfWeek: 28,
          monthsOfYear: 5,
          style: 29,
          buttonBackgroundColor: 30,
          buttonBorderColor: 31,
          buttonTextColor: 32,
          highlightColor: 33,
          dayBackgroundColor: 34,
          dayTextColor: 35,
          dayHighlightedBackgroundColor: 36,
          dayHighlightedTextColor: 37,
          formattedSelected: 2
        }, [-1, -1, -1]);
      }

    }

    /* src\widgets\Modal.svelte generated by Svelte v3.38.3 */

    function fallback_block$2(ctx) {
      let t;
      return {
        c() {
          t = text("No content specified");
        },

        m(target, anchor) {
          insert(target, t, anchor);
        },

        d(detaching) {
          if (detaching) detach(t);
        }

      };
    }

    function create_fragment$6(ctx) {
      let div3;
      let div2;
      let div0;
      let t1;
      let div1;
      let div2_intro;
      let div2_outro;
      let div3_intro;
      let div3_outro;
      let current;
      let mounted;
      let dispose;
      const default_slot_template =
      /*#slots*/
      ctx[2].default;
      const default_slot = create_slot(default_slot_template, ctx,
      /*$$scope*/
      ctx[1], null);
      const default_slot_or_fallback = default_slot || fallback_block$2();
      return {
        c() {
          div3 = element("div");
          div2 = element("div");
          div0 = element("div");
          div0.textContent = "×";
          t1 = space();
          div1 = element("div");
          if (default_slot_or_fallback) default_slot_or_fallback.c();
          attr(div0, "class", "close svelte-8510x2");
          attr(div1, "class", "inner svelte-8510x2");
          attr(div2, "class", "modal-inner top-border-secondary svelte-8510x2");
          attr(div3, "class", "modal-background svelte-8510x2");
        },

        m(target, anchor) {
          insert(target, div3, anchor);
          append(div3, div2);
          append(div2, div0);
          append(div2, t1);
          append(div2, div1);

          if (default_slot_or_fallback) {
            default_slot_or_fallback.m(div1, null);
          }

          current = true;

          if (!mounted) {
            dispose = [listen(div0, "click",
            /*click_handler_1*/
            ctx[4]), listen(div2, "click", stop_propagation(
            /*click_handler*/
            ctx[3]))];
            mounted = true;
          }
        },

        p(ctx, [dirty]) {
          if (default_slot) {
            if (default_slot.p && (!current || dirty &
            /*$$scope*/
            2)) {
              update_slot(default_slot, default_slot_template, ctx,
              /*$$scope*/
              ctx[1], !current ? -1 : dirty, null, null);
            }
          }
        },

        i(local) {
          if (current) return;
          transition_in(default_slot_or_fallback, local);
          add_render_callback(() => {
            if (div2_outro) div2_outro.end(1);
            if (!div2_intro) div2_intro = create_in_transition(div2, scale, {
              duration: 150,
              delay: 200
            });
            div2_intro.start();
          });
          add_render_callback(() => {
            if (div3_outro) div3_outro.end(1);
            if (!div3_intro) div3_intro = create_in_transition(div3, fade, {
              duration: 300
            });
            div3_intro.start();
          });
          current = true;
        },

        o(local) {
          transition_out(default_slot_or_fallback, local);
          if (div2_intro) div2_intro.invalidate();
          div2_outro = create_out_transition(div2, scale, {
            duration: 150
          });
          if (div3_intro) div3_intro.invalidate();
          div3_outro = create_out_transition(div3, fade, {
            duration: 300,
            delay: 150
          });
          current = false;
        },

        d(detaching) {
          if (detaching) detach(div3);
          if (default_slot_or_fallback) default_slot_or_fallback.d(detaching);
          if (detaching && div2_outro) div2_outro.end();
          if (detaching && div3_outro) div3_outro.end();
          mounted = false;
          run_all(dispose);
        }

      };
    }

    function instance$6($$self, $$props, $$invalidate) {
      let {
        $$slots: slots = {},
        $$scope
      } = $$props;
      const dispatch = createEventDispatcher();

      function click_handler(event) {
        bubble.call(this, $$self, event);
      }

      const click_handler_1 = () => {
        dispatch("forceClose");
      };

      $$self.$$set = $$props => {
        if ("$$scope" in $$props) $$invalidate(1, $$scope = $$props.$$scope);
      };

      return [dispatch, $$scope, slots, click_handler, click_handler_1];
    }

    class Modal extends SvelteComponent {
      constructor(options) {
        super();
        init(this, options, instance$6, create_fragment$6, safe_not_equal, {});
      }

    }

    function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

    function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

    function get_each_context$5(ctx, list, i) {
      const child_ctx = ctx.slice();
      child_ctx[73] = list[i];
      child_ctx[74] = list;
      child_ctx[75] = i;
      return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
      const child_ctx = ctx.slice();
      child_ctx[76] = list[i];
      return child_ctx;
    } // (378:4) {:else}


    function create_else_block_2(ctx) {
      let div;
      let h2;
      let t0;
      let t1_value =
      /*student*/
      ctx[10].fname + "";
      let t1;
      let t2;
      let t3_value = formatText(
      /*$settings*/
      ctx[20].abbrev, false, false, true) + "";
      let t3;
      let t4;
      let p;
      let t5;
      let button;
      let t7;
      let div_intro;
      let div_outro;
      let current;
      let mounted;
      let dispose;
      return {
        c() {
          div = element("div");
          h2 = element("h2");
          t0 = text("Edit ");
          t1 = text(t1_value);
          t2 = text("'s ");
          t3 = text(t3_value);
          t4 = space();
          p = element("p");
          t5 = text("...or ");
          button = element("button");
          button.textContent = "write a new one";
          t7 = text(".");
          attr(h2, "class", "svelte-f6g00h");
          attr(button, "class", "just-text svelte-f6g00h");
          attr(p, "class", "mt-0");
          attr(div, "class", "switchable svelte-f6g00h");
        },

        m(target, anchor) {
          insert(target, div, anchor);
          append(div, h2);
          append(h2, t0);
          append(h2, t1);
          append(h2, t2);
          append(h2, t3);
          append(div, t4);
          append(div, p);
          append(p, t5);
          append(p, button);
          append(p, t7);
          current = true;

          if (!mounted) {
            dispose = listen(button, "click",
            /*writeNewLOA*/
            ctx[24]);
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if ((!current || dirty[0] &
          /*student*/
          1024) && t1_value !== (t1_value =
          /*student*/
          ctx[10].fname + "")) set_data(t1, t1_value);
          if ((!current || dirty[0] &
          /*$settings*/
          1048576) && t3_value !== (t3_value = formatText(
          /*$settings*/
          ctx[20].abbrev, false, false, true) + "")) set_data(t3, t3_value);
        },

        i(local) {
          if (current) return;

          if (local) {
            add_render_callback(() => {
              if (div_outro) div_outro.end(1);
              if (!div_intro) div_intro = create_in_transition(div, fly, {
                x: 100,
                delay: 500
              });
              div_intro.start();
            });
          }

          current = true;
        },

        o(local) {
          if (div_intro) div_intro.invalidate();

          if (local) {
            div_outro = create_out_transition(div,
            /*flyModified*/
            ctx[21], {
              x: 100,
              position: "absolute"
            });
          }

          current = false;
        },

        d(detaching) {
          if (detaching) detach(div);
          if (detaching && div_outro) div_outro.end();
          mounted = false;
          dispose();
        }

      };
    } // (373:4) {#if LOAnew}


    function create_if_block_11(ctx) {
      let div;
      let h2;
      let t0;
      let t1_value = formatText(
      /*$settings*/
      ctx[20].abbrev, false, false, true) + "";
      let t1;
      let t2;
      let p;
      let t3;
      let button;
      let t5;
      let div_intro;
      let div_outro;
      let current;
      let mounted;
      let dispose;
      return {
        c() {
          div = element("div");
          h2 = element("h2");
          t0 = text("Issue a New ");
          t1 = text(t1_value);
          t2 = space();
          p = element("p");
          t3 = text("...or ");
          button = element("button");
          button.textContent = "search for an existing one";
          t5 = text(".");
          attr(h2, "class", "svelte-f6g00h");
          attr(button, "class", "just-text svelte-f6g00h");
          attr(p, "class", "mt-0");
          attr(div, "class", "switchable svelte-f6g00h");
        },

        m(target, anchor) {
          insert(target, div, anchor);
          append(div, h2);
          append(h2, t0);
          append(h2, t1);
          append(div, t2);
          append(div, p);
          append(p, t3);
          append(p, button);
          append(p, t5);
          current = true;

          if (!mounted) {
            dispose = listen(button, "click",
            /*searchForStudent*/
            ctx[25]);
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if ((!current || dirty[0] &
          /*$settings*/
          1048576) && t1_value !== (t1_value = formatText(
          /*$settings*/
          ctx[20].abbrev, false, false, true) + "")) set_data(t1, t1_value);
        },

        i(local) {
          if (current) return;

          if (local) {
            add_render_callback(() => {
              if (div_outro) div_outro.end(1);
              if (!div_intro) div_intro = create_in_transition(div, fly, {
                x: 100,
                delay: 500
              });
              div_intro.start();
            });
          }

          current = true;
        },

        o(local) {
          if (div_intro) div_intro.invalidate();

          if (local) {
            div_outro = create_out_transition(div,
            /*flyModified*/
            ctx[21], {
              x: 100,
              position: "absolute"
            });
          }

          current = false;
        },

        d(detaching) {
          if (detaching) detach(div);
          if (detaching && div_outro) div_outro.end();
          mounted = false;
          dispose();
        }

      };
    } // (387:12) <Datepicker style={style} end={new Date(Date.now())} bind:selected={dateUpdated}>


    function create_default_slot_8(ctx) {
      let input;
      let input_value_value;
      return {
        c() {
          input = element("input");
          attr(input, "type", "text");
          input.value = input_value_value =
          /*months*/
          ctx[23][
          /*dateUpdated*/
          ctx[13].getMonth()] + " " +
          /*dateUpdated*/
          ctx[13].getDate() + ", " +
          /*dateUpdated*/
          ctx[13].getFullYear();
          attr(input, "class", "svelte-f6g00h");
        },

        m(target, anchor) {
          insert(target, input, anchor);
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*dateUpdated*/
          8192 && input_value_value !== (input_value_value =
          /*months*/
          ctx[23][
          /*dateUpdated*/
          ctx[13].getMonth()] + " " +
          /*dateUpdated*/
          ctx[13].getDate() + ", " +
          /*dateUpdated*/
          ctx[13].getFullYear()) && input.value !== input_value_value) {
            input.value = input_value_value;
          }
        },

        d(detaching) {
          if (detaching) detach(input);
        }

      };
    } // (423:16) {:else}


    function create_else_block_1(ctx) {
      let li;
      let t0;
      let t1_value = formatText(
      /*$settings*/
      ctx[20].services, true, false) + "";
      let t1;
      let t2;
      let a;
      let mounted;
      let dispose;
      return {
        c() {
          li = element("li");
          t0 = text("No ");
          t1 = text(t1_value);
          t2 = text(" listed - ");
          a = element("a");
          a.textContent = "add some!";
          attr(a, "href", "addAccom");
        },

        m(target, anchor) {
          insert(target, li, anchor);
          append(li, t0);
          append(li, t1);
          append(li, t2);
          append(li, a);

          if (!mounted) {
            dispose = listen(a, "click", prevent_default(
            /*click_handler_2*/
            ctx[40]));
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*$settings*/
          1048576 && t1_value !== (t1_value = formatText(
          /*$settings*/
          ctx[20].services, true, false) + "")) set_data(t1, t1_value);
        },

        i: noop,
        o: noop,

        d(detaching) {
          if (detaching) detach(li);
          mounted = false;
          dispose();
        }

      };
    } // (409:16) {#if selectedAccoms.length > 0}


    function create_if_block_10(ctx) {
      let sortablelist;
      let t0;
      let li;
      let a;
      let current;
      let mounted;
      let dispose;
      sortablelist = new SortableList({
        props: {
          list:
          /*selectedAccoms*/
          ctx[19],
          key: "_id",
          $$slots: {
            default: [create_default_slot_7, ({
              item,
              index
            }) => ({
              79: item,
              80: index
            }), ({
              item,
              index
            }) => [0, 0, (item ? 131072 : 0) | (index ? 262144 : 0)]]
          },
          $$scope: {
            ctx
          }
        }
      });
      sortablelist.$on("sort",
      /*sortAccoms*/
      ctx[22]);
      return {
        c() {
          create_component(sortablelist.$$.fragment);
          t0 = space();
          li = element("li");
          a = element("a");
          a.textContent = "Add more";
          attr(a, "href", "addAccom");
        },

        m(target, anchor) {
          mount_component(sortablelist, target, anchor);
          insert(target, t0, anchor);
          insert(target, li, anchor);
          append(li, a);
          current = true;

          if (!mounted) {
            dispose = listen(a, "click", prevent_default(
            /*click_handler_1*/
            ctx[39]));
            mounted = true;
          }
        },

        p(ctx, dirty) {
          const sortablelist_changes = {};
          if (dirty[0] &
          /*selectedAccoms*/
          524288) sortablelist_changes.list =
          /*selectedAccoms*/
          ctx[19];

          if (dirty[0] &
          /*accoms*/
          1 | dirty[2] &
          /*$$scope, item*/
          655360) {
            sortablelist_changes.$$scope = {
              dirty,
              ctx
            };
          }

          sortablelist.$set(sortablelist_changes);
        },

        i(local) {
          if (current) return;
          transition_in(sortablelist.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(sortablelist.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(sortablelist, detaching);
          if (detaching) detach(t0);
          if (detaching) detach(li);
          mounted = false;
          dispose();
        }

      };
    } // (410:20) <SortableList                           list={selectedAccoms}                           key="_id"                          on:sort={sortAccoms}                           let:item                          let:index>


    function create_default_slot_7(ctx) {
      let li;
      let h4;
      let t0_value =
      /*item*/
      ctx[79].name + "";
      let t0;
      let t1;
      let p;
      let t2_value = abbreviate(
      /*item*/
      ctx[79].content, 150) + "";
      let t2;
      let t3;
      let div;
      let mounted;
      let dispose;

      function click_handler() {
        return (
          /*click_handler*/
          ctx[38](
          /*item*/
          ctx[79])
        );
      }

      return {
        c() {
          li = element("li");
          h4 = element("h4");
          t0 = text(t0_value);
          t1 = space();
          p = element("p");
          t2 = text(t2_value);
          t3 = space();
          div = element("div");
          div.textContent = "×";
          attr(div, "class", "close");
          attr(li, "class", "whitebox accommodation svelte-f6g00h");
        },

        m(target, anchor) {
          insert(target, li, anchor);
          append(li, h4);
          append(h4, t0);
          append(li, t1);
          append(li, p);
          append(p, t2);
          append(li, t3);
          append(li, div);

          if (!mounted) {
            dispose = listen(div, "click", click_handler);
            mounted = true;
          }
        },

        p(new_ctx, dirty) {
          ctx = new_ctx;
          if (dirty[2] &
          /*item*/
          131072 && t0_value !== (t0_value =
          /*item*/
          ctx[79].name + "")) set_data(t0, t0_value);
          if (dirty[2] &
          /*item*/
          131072 && t2_value !== (t2_value = abbreviate(
          /*item*/
          ctx[79].content, 150) + "")) set_data(t2, t2_value);
        },

        d(detaching) {
          if (detaching) detach(li);
          mounted = false;
          dispose();
        }

      };
    } // (431:12) {#if studentNotesHighlighted}


    function create_if_block_9(ctx) {
      let div;
      let t_value = (
      /*studentNotes*/
      ctx[12] ? 250 -
      /*studentNotes*/
      ctx[12].length : 250) + "";
      let t;
      let div_transition;
      let current;
      return {
        c() {
          div = element("div");
          t = text(t_value);
          attr(div, "class", "remaining-characters");
        },

        m(target, anchor) {
          insert(target, div, anchor);
          append(div, t);
          current = true;
        },

        p(ctx, dirty) {
          if ((!current || dirty[0] &
          /*studentNotes*/
          4096) && t_value !== (t_value = (
          /*studentNotes*/
          ctx[12] ? 250 -
          /*studentNotes*/
          ctx[12].length : 250) + "")) set_data(t, t_value);
        },

        i(local) {
          if (current) return;
          add_render_callback(() => {
            if (!div_transition) div_transition = create_bidirectional_transition(div, scale, {}, true);
            div_transition.run(1);
          });
          current = true;
        },

        o(local) {
          if (!div_transition) div_transition = create_bidirectional_transition(div, scale, {}, false);
          div_transition.run(0);
          current = false;
        },

        d(detaching) {
          if (detaching) detach(div);
          if (detaching && div_transition) div_transition.end();
        }

      };
    } // (447:4) {#if showSearchModal}


    function create_if_block_8(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_6]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler*/
      ctx[50]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*searchStud, $settings*/
          1050624 | dirty[2] &
          /*$$scope*/
          524288) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (448:8) <Modal on:forceClose={()=>{ showSearchModal = false; }}>


    function create_default_slot_6(ctx) {
      let h3;
      let t0;
      let t1_value = formatText(
      /*$settings*/
      ctx[20].students, false, true) + "";
      let t1;
      let t2;
      let p;
      let t4;
      let form;
      let div0;
      let label0;
      let t6;
      let input0;
      let t7;
      let div1;
      let label1;
      let t9;
      let input1;
      let t10;
      let div2;
      let label2;
      let t12;
      let input2;
      let t13;
      let button;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          t0 = text("Find a ");
          t1 = text(t1_value);
          t2 = space();
          p = element("p");
          p.textContent = "Search by ID or first and last name. You can leave out parameters, but you must spell names correctly and fully match names and IDs (case-sensitive!).";
          t4 = space();
          form = element("form");
          div0 = element("div");
          label0 = element("label");
          label0.textContent = "ID#";
          t6 = space();
          input0 = element("input");
          t7 = space();
          div1 = element("div");
          label1 = element("label");
          label1.textContent = "First Name";
          t9 = space();
          input1 = element("input");
          t10 = space();
          div2 = element("div");
          label2 = element("label");
          label2.textContent = "Last Name";
          t12 = space();
          input2 = element("input");
          t13 = space();
          button = element("button");
          button.textContent = "Find them!";
          set_style(p, "max-width", "30em");
          attr(label0, "for", "search-id");
          attr(input0, "id", "search-id");
          attr(input0, "type", "text");
          attr(input0, "maxlength", "20");
          attr(input0, "class", "svelte-f6g00h");
          attr(div0, "class", "form-halves");
          attr(label1, "for", "search-fname");
          attr(input1, "id", "search-fname");
          attr(input1, "type", "text");
          attr(input1, "maxlength", "100");
          attr(input1, "class", "svelte-f6g00h");
          attr(div1, "class", "form-halves");
          attr(label2, "for", "search-lname");
          attr(input2, "id", "search-lname");
          attr(input2, "type", "text");
          attr(input2, "maxlength", "100");
          attr(input2, "class", "svelte-f6g00h");
          attr(div2, "class", "form-halves");
          attr(button, "class", "centered blue");
          attr(button, "type", "submit");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          append(h3, t0);
          append(h3, t1);
          insert(target, t2, anchor);
          insert(target, p, anchor);
          insert(target, t4, anchor);
          insert(target, form, anchor);
          append(form, div0);
          append(div0, label0);
          append(div0, t6);
          append(div0, input0);
          set_input_value(input0,
          /*searchStud*/
          ctx[11]._id);
          append(form, t7);
          append(form, div1);
          append(div1, label1);
          append(div1, t9);
          append(div1, input1);
          set_input_value(input1,
          /*searchStud*/
          ctx[11].fname);
          append(form, t10);
          append(form, div2);
          append(div2, label2);
          append(div2, t12);
          append(div2, input2);
          set_input_value(input2,
          /*searchStud*/
          ctx[11].lname);
          append(form, t13);
          append(form, button);

          if (!mounted) {
            dispose = [listen(input0, "input",
            /*input0_input_handler_1*/
            ctx[47]), listen(input1, "input",
            /*input1_input_handler_1*/
            ctx[48]), listen(input2, "input",
            /*input2_input_handler_1*/
            ctx[49]), listen(button, "click", prevent_default(
            /*search*/
            ctx[29]))];
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*$settings*/
          1048576 && t1_value !== (t1_value = formatText(
          /*$settings*/
          ctx[20].students, false, true) + "")) set_data(t1, t1_value);

          if (dirty[0] &
          /*searchStud*/
          2048 && input0.value !==
          /*searchStud*/
          ctx[11]._id) {
            set_input_value(input0,
            /*searchStud*/
            ctx[11]._id);
          }

          if (dirty[0] &
          /*searchStud*/
          2048 && input1.value !==
          /*searchStud*/
          ctx[11].fname) {
            set_input_value(input1,
            /*searchStud*/
            ctx[11].fname);
          }

          if (dirty[0] &
          /*searchStud*/
          2048 && input2.value !==
          /*searchStud*/
          ctx[11].lname) {
            set_input_value(input2,
            /*searchStud*/
            ctx[11].lname);
          }
        },

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t2);
          if (detaching) detach(p);
          if (detaching) detach(t4);
          if (detaching) detach(form);
          mounted = false;
          run_all(dispose);
        }

      };
    } // (470:4) {#if showOverwriteModal}


    function create_if_block_7(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_5]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_1*/
      ctx[53]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*showOverwriteModal, $settings*/
          1048608 | dirty[2] &
          /*$$scope*/
          524288) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (471:8) <Modal on:forceClose={()=>{ showOverwriteModal = false }}>


    function create_default_slot_5(ctx) {
      let h3;
      let t0;
      let t1_value = formatText(
      /*$settings*/
      ctx[20].students, false, false) + "";
      let t1;
      let t2;
      let t3;
      let p;
      let t4;
      let t5_value = formatText(
      /*$settings*/
      ctx[20].students, false, false) + "";
      let t5;
      let t6;
      let t7_value = formatText(
      /*$settings*/
      ctx[20].abbrev, false, false, true) + "";
      let t7;
      let t8;
      let t9;
      let div;
      let button0;
      let t11;
      let button1;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          t0 = text("Found an existing ");
          t1 = text(t1_value);
          t2 = text("!");
          t3 = space();
          p = element("p");
          t4 = text("A ");
          t5 = text(t5_value);
          t6 = text(" with that ID already exists. Do you want to issue a new ");
          t7 = text(t7_value);
          t8 = text(" for them?");
          t9 = space();
          div = element("div");
          button0 = element("button");
          button0.textContent = "Yes";
          t11 = space();
          button1 = element("button");
          button1.textContent = "No";
          attr(button0, "class", "centered");
          attr(button0, "type", "submit");
          attr(button1, "class", "centered blue");
          attr(button1, "type", "submit");
          attr(div, "class", "align-ends");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          append(h3, t0);
          append(h3, t1);
          append(h3, t2);
          insert(target, t3, anchor);
          insert(target, p, anchor);
          append(p, t4);
          append(p, t5);
          append(p, t6);
          append(p, t7);
          append(p, t8);
          insert(target, t9, anchor);
          insert(target, div, anchor);
          append(div, button0);
          append(div, t11);
          append(div, button1);

          if (!mounted) {
            dispose = [listen(button0, "click", prevent_default(
            /*click_handler_5*/
            ctx[51])), listen(button1, "click", prevent_default(
            /*click_handler_6*/
            ctx[52]))];
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*$settings*/
          1048576 && t1_value !== (t1_value = formatText(
          /*$settings*/
          ctx[20].students, false, false) + "")) set_data(t1, t1_value);
          if (dirty[0] &
          /*$settings*/
          1048576 && t5_value !== (t5_value = formatText(
          /*$settings*/
          ctx[20].students, false, false) + "")) set_data(t5, t5_value);
          if (dirty[0] &
          /*$settings*/
          1048576 && t7_value !== (t7_value = formatText(
          /*$settings*/
          ctx[20].abbrev, false, false, true) + "")) set_data(t7, t7_value);
        },

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t3);
          if (detaching) detach(p);
          if (detaching) detach(t9);
          if (detaching) detach(div);
          mounted = false;
          run_all(dispose);
        }

      };
    } // (481:4) {#if showSearchListModal}


    function create_if_block_5(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_4]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_2*/
      ctx[56]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*showSearchListModal, showSearchModal, searchResults, $settings*/
          1049112 | dirty[2] &
          /*$$scope*/
          524288) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (486:12) {:else}


    function create_else_block(ctx) {
      let p;
      let t0;
      let t1_value = formatText(
      /*$settings*/
      ctx[20].students, true, false) + "";
      let t1;
      let t2;
      let t3;
      let ul;
      let each_value_1 =
      /*searchResults*/
      ctx[9];
      let each_blocks = [];

      for (let i = 0; i < each_value_1.length; i += 1) {
        each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
      }

      return {
        c() {
          p = element("p");
          t0 = text("We found the following ");
          t1 = text(t1_value);
          t2 = text(":");
          t3 = space();
          ul = element("ul");

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].c();
          }

          attr(ul, "class", "selectables svelte-f6g00h");
        },

        m(target, anchor) {
          insert(target, p, anchor);
          append(p, t0);
          append(p, t1);
          append(p, t2);
          insert(target, t3, anchor);
          insert(target, ul, anchor);

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].m(ul, null);
          }
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*$settings*/
          1048576 && t1_value !== (t1_value = formatText(
          /*$settings*/
          ctx[20].students, true, false) + "")) set_data(t1, t1_value);

          if (dirty[0] &
          /*loadStudent, searchResults*/
          268435968) {
            each_value_1 =
            /*searchResults*/
            ctx[9];
            let i;

            for (i = 0; i < each_value_1.length; i += 1) {
              const child_ctx = get_each_context_1(ctx, each_value_1, i);

              if (each_blocks[i]) {
                each_blocks[i].p(child_ctx, dirty);
              } else {
                each_blocks[i] = create_each_block_1(child_ctx);
                each_blocks[i].c();
                each_blocks[i].m(ul, null);
              }
            }

            for (; i < each_blocks.length; i += 1) {
              each_blocks[i].d(1);
            }

            each_blocks.length = each_value_1.length;
          }
        },

        d(detaching) {
          if (detaching) detach(p);
          if (detaching) detach(t3);
          if (detaching) detach(ul);
          destroy_each(each_blocks, detaching);
        }

      };
    } // (484:12) {#if searchResults.length == 0}


    function create_if_block_6(ctx) {
      let p;
      return {
        c() {
          p = element("p");
          p.textContent = "No results were found. :-(";
        },

        m(target, anchor) {
          insert(target, p, anchor);
        },

        p: noop,

        d(detaching) {
          if (detaching) detach(p);
        }

      };
    } // (489:16) {#each searchResults as result}


    function create_each_block_1(ctx) {
      let li;
      let t0_value =
      /*result*/
      ctx[76].student.lname + "";
      let t0;
      let t1;
      let t2_value =
      /*result*/
      ctx[76].student.fname + "";
      let t2;
      let t3;
      let t4_value =
      /*result*/
      ctx[76].student._id + "";
      let t4;
      let mounted;
      let dispose;

      function click_handler_7() {
        return (
          /*click_handler_7*/
          ctx[54](
          /*result*/
          ctx[76])
        );
      }

      return {
        c() {
          li = element("li");
          t0 = text(t0_value);
          t1 = text(", ");
          t2 = text(t2_value);
          t3 = text(" - ");
          t4 = text(t4_value);
          attr(li, "class", "svelte-f6g00h");
        },

        m(target, anchor) {
          insert(target, li, anchor);
          append(li, t0);
          append(li, t1);
          append(li, t2);
          append(li, t3);
          append(li, t4);

          if (!mounted) {
            dispose = listen(li, "click", click_handler_7);
            mounted = true;
          }
        },

        p(new_ctx, dirty) {
          ctx = new_ctx;
          if (dirty[0] &
          /*searchResults*/
          512 && t0_value !== (t0_value =
          /*result*/
          ctx[76].student.lname + "")) set_data(t0, t0_value);
          if (dirty[0] &
          /*searchResults*/
          512 && t2_value !== (t2_value =
          /*result*/
          ctx[76].student.fname + "")) set_data(t2, t2_value);
          if (dirty[0] &
          /*searchResults*/
          512 && t4_value !== (t4_value =
          /*result*/
          ctx[76].student._id + "")) set_data(t4, t4_value);
        },

        d(detaching) {
          if (detaching) detach(li);
          mounted = false;
          dispose();
        }

      };
    } // (482:8) <Modal on:forceClose={()=> { showSearchListModal = false; }}>


    function create_default_slot_4(ctx) {
      let h3;
      let t1;
      let t2;
      let button;
      let mounted;
      let dispose;

      function select_block_type_2(ctx, dirty) {
        if (
        /*searchResults*/
        ctx[9].length == 0) return create_if_block_6;
        return create_else_block;
      }

      let current_block_type = select_block_type_2(ctx);
      let if_block = current_block_type(ctx);
      return {
        c() {
          h3 = element("h3");
          h3.textContent = "Results";
          t1 = space();
          if_block.c();
          t2 = space();
          button = element("button");
          button.textContent = "Back";
          attr(button, "class", "centered");
          attr(button, "type", "submit");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          insert(target, t1, anchor);
          if_block.m(target, anchor);
          insert(target, t2, anchor);
          insert(target, button, anchor);

          if (!mounted) {
            dispose = listen(button, "click", prevent_default(
            /*click_handler_8*/
            ctx[55]));
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if (current_block_type === (current_block_type = select_block_type_2(ctx)) && if_block) {
            if_block.p(ctx, dirty);
          } else {
            if_block.d(1);
            if_block = current_block_type(ctx);

            if (if_block) {
              if_block.c();
              if_block.m(t2.parentNode, t2);
            }
          }
        },

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t1);
          if_block.d(detaching);
          if (detaching) detach(t2);
          if (detaching) detach(button);
          mounted = false;
          dispose();
        }

      };
    } // (498:4) {#if showSavedModal}


    function create_if_block_4(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_3]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_3*/
      ctx[58]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*$settings, student*/
          1049600 | dirty[2] &
          /*$$scope*/
          524288) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (499:8) <Modal on:forceClose={()=> { endSave() }}>


    function create_default_slot_3(ctx) {
      let h3;
      let t1;
      let p;
      let t2;
      let t3_value =
      /*student*/
      ctx[10].fname + "";
      let t3;
      let t4;
      let t5_value =
      /*student*/
      ctx[10].lname + "";
      let t5;
      let t6;
      let t7_value = formatText(
      /*$settings*/
      ctx[20].abbrev, false, false, true) + "";
      let t7;
      let t8;
      let t9;
      let button;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          h3.textContent = "Saved!";
          t1 = space();
          p = element("p");
          t2 = text("You saved ");
          t3 = text(t3_value);
          t4 = space();
          t5 = text(t5_value);
          t6 = text("'s ");
          t7 = text(t7_value);
          t8 = text(".");
          t9 = space();
          button = element("button");
          button.textContent = "OK";
          attr(button, "class", "centered blue");
          attr(button, "type", "submit");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          insert(target, t1, anchor);
          insert(target, p, anchor);
          append(p, t2);
          append(p, t3);
          append(p, t4);
          append(p, t5);
          append(p, t6);
          append(p, t7);
          append(p, t8);
          insert(target, t9, anchor);
          insert(target, button, anchor);

          if (!mounted) {
            dispose = listen(button, "click", prevent_default(
            /*click_handler_9*/
            ctx[57]));
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*student*/
          1024 && t3_value !== (t3_value =
          /*student*/
          ctx[10].fname + "")) set_data(t3, t3_value);
          if (dirty[0] &
          /*student*/
          1024 && t5_value !== (t5_value =
          /*student*/
          ctx[10].lname + "")) set_data(t5, t5_value);
          if (dirty[0] &
          /*$settings*/
          1048576 && t7_value !== (t7_value = formatText(
          /*$settings*/
          ctx[20].abbrev, false, false, true) + "")) set_data(t7, t7_value);
        },

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t1);
          if (detaching) detach(p);
          if (detaching) detach(t9);
          if (detaching) detach(button);
          mounted = false;
          dispose();
        }

      };
    } // (506:4) {#if showFormErrorModal}


    function create_if_block_3(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_2]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_4*/
      ctx[60]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*showFormErrorModal, $settings*/
          1048704 | dirty[2] &
          /*$$scope*/
          524288) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (507:8) <Modal on:forceClose={()=> { showFormErrorModal = false }}>


    function create_default_slot_2(ctx) {
      let h3;
      let t1;
      let p;
      let t2;
      let t3_value = formatText(
      /*$settings*/
      ctx[20].students, false, false) + "";
      let t3;
      let t4;
      let t5_value = formatText(
      /*$settings*/
      ctx[20].services, true, false) + "";
      let t5;
      let t6;
      let t7_value = formatText(
      /*$settings*/
      ctx[20].students, false, false) + "";
      let t7;
      let t8;
      let t9;
      let button;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          h3.textContent = "Whoops!";
          t1 = space();
          p = element("p");
          t2 = text("Looks like you didn't fill in all the ");
          t3 = text(t3_value);
          t4 = text("'s information. Also make sure that you've added all the ");
          t5 = text(t5_value);
          t6 = text(" the ");
          t7 = text(t7_value);
          t8 = text(" needs.");
          t9 = space();
          button = element("button");
          button.textContent = "OK";
          attr(button, "class", "centered blue");
          attr(button, "type", "submit");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          insert(target, t1, anchor);
          insert(target, p, anchor);
          append(p, t2);
          append(p, t3);
          append(p, t4);
          append(p, t5);
          append(p, t6);
          append(p, t7);
          append(p, t8);
          insert(target, t9, anchor);
          insert(target, button, anchor);

          if (!mounted) {
            dispose = listen(button, "click", prevent_default(
            /*click_handler_10*/
            ctx[59]));
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*$settings*/
          1048576 && t3_value !== (t3_value = formatText(
          /*$settings*/
          ctx[20].students, false, false) + "")) set_data(t3, t3_value);
          if (dirty[0] &
          /*$settings*/
          1048576 && t5_value !== (t5_value = formatText(
          /*$settings*/
          ctx[20].services, true, false) + "")) set_data(t5, t5_value);
          if (dirty[0] &
          /*$settings*/
          1048576 && t7_value !== (t7_value = formatText(
          /*$settings*/
          ctx[20].students, false, false) + "")) set_data(t7, t7_value);
        },

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t1);
          if (detaching) detach(p);
          if (detaching) detach(t9);
          if (detaching) detach(button);
          mounted = false;
          dispose();
        }

      };
    } // (514:4) {#if showAccomsModal}


    function create_if_block_2(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_1]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_5*/
      ctx[63]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*showAccomsModal, $settings, accoms, customAccoms*/
          1048835 | dirty[2] &
          /*$$scope*/
          524288) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (518:16) {#each [...accoms, ...customAccoms] as accom}


    function create_each_block$5(ctx) {
      let li;
      let t_value = abbreviate(
      /*accom*/
      ctx[73].name, 100) + "";
      let t;
      let li_title_value;
      let mounted;
      let dispose;

      function click_handler_11() {
        return (
          /*click_handler_11*/
          ctx[61](
          /*accom*/
          ctx[73],
          /*each_value*/
          ctx[74],
          /*accom_index*/
          ctx[75])
        );
      }

      return {
        c() {
          li = element("li");
          t = text(t_value);
          attr(li, "title", li_title_value =
          /*accom*/
          ctx[73].name);
          attr(li, "class", "svelte-f6g00h");
          toggle_class(li, "selected",
          /*accom*/
          ctx[73].selected);
        },

        m(target, anchor) {
          insert(target, li, anchor);
          append(li, t);

          if (!mounted) {
            dispose = listen(li, "click", click_handler_11);
            mounted = true;
          }
        },

        p(new_ctx, dirty) {
          ctx = new_ctx;
          if (dirty[0] &
          /*accoms, customAccoms*/
          3 && t_value !== (t_value = abbreviate(
          /*accom*/
          ctx[73].name, 100) + "")) set_data(t, t_value);

          if (dirty[0] &
          /*accoms, customAccoms*/
          3 && li_title_value !== (li_title_value =
          /*accom*/
          ctx[73].name)) {
            attr(li, "title", li_title_value);
          }

          if (dirty[0] &
          /*accoms, customAccoms*/
          3) {
            toggle_class(li, "selected",
            /*accom*/
            ctx[73].selected);
          }
        },

        d(detaching) {
          if (detaching) detach(li);
          mounted = false;
          dispose();
        }

      };
    } // (515:8) <Modal on:forceClose={()=>{ showAccomsModal = false }}>


    function create_default_slot_1(ctx) {
      let h3;
      let t0;
      let t1_value = formatText(
      /*$settings*/
      ctx[20].services, true, true) + "";
      let t1;
      let t2;
      let ul;
      let t3;
      let p;
      let t4;
      let a;
      let t5;
      let t6_value = formatText(
      /*$settings*/
      ctx[20].services, false, false) + "";
      let t6;
      let t7;
      let t8;
      let button;
      let mounted;
      let dispose;
      let each_value = [...
      /*accoms*/
      ctx[0], ...
      /*customAccoms*/
      ctx[1]];
      let each_blocks = [];

      for (let i = 0; i < each_value.length; i += 1) {
        each_blocks[i] = create_each_block$5(get_each_context$5(ctx, each_value, i));
      }

      return {
        c() {
          h3 = element("h3");
          t0 = text("Select ");
          t1 = text(t1_value);
          t2 = space();
          ul = element("ul");

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].c();
          }

          t3 = space();
          p = element("p");
          t4 = text("...or ");
          a = element("a");
          t5 = text("add a custom ");
          t6 = text(t6_value);
          t7 = text(".");
          t8 = space();
          button = element("button");
          button.textContent = "OK";
          attr(ul, "id", "accoms-modal-list");
          attr(ul, "class", "svelte-f6g00h");
          attr(a, "href", "custom");
          attr(button, "class", "centered blue");
          attr(button, "type", "submit");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          append(h3, t0);
          append(h3, t1);
          insert(target, t2, anchor);
          insert(target, ul, anchor);

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].m(ul, null);
          }

          insert(target, t3, anchor);
          insert(target, p, anchor);
          append(p, t4);
          append(p, a);
          append(a, t5);
          append(a, t6);
          append(a, t7);
          insert(target, t8, anchor);
          insert(target, button, anchor);

          if (!mounted) {
            dispose = [listen(a, "click", prevent_default(
            /*addCustomAccom*/
            ctx[31])), listen(button, "click", prevent_default(
            /*click_handler_12*/
            ctx[62]))];
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*$settings*/
          1048576 && t1_value !== (t1_value = formatText(
          /*$settings*/
          ctx[20].services, true, true) + "")) set_data(t1, t1_value);

          if (dirty[0] &
          /*accoms, customAccoms*/
          3) {
            each_value = [...
            /*accoms*/
            ctx[0], ...
            /*customAccoms*/
            ctx[1]];
            let i;

            for (i = 0; i < each_value.length; i += 1) {
              const child_ctx = get_each_context$5(ctx, each_value, i);

              if (each_blocks[i]) {
                each_blocks[i].p(child_ctx, dirty);
              } else {
                each_blocks[i] = create_each_block$5(child_ctx);
                each_blocks[i].c();
                each_blocks[i].m(ul, null);
              }
            }

            for (; i < each_blocks.length; i += 1) {
              each_blocks[i].d(1);
            }

            each_blocks.length = each_value.length;
          }

          if (dirty[0] &
          /*$settings*/
          1048576 && t6_value !== (t6_value = formatText(
          /*$settings*/
          ctx[20].services, false, false) + "")) set_data(t6, t6_value);
        },

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t2);
          if (detaching) detach(ul);
          destroy_each(each_blocks, detaching);
          if (detaching) detach(t3);
          if (detaching) detach(p);
          if (detaching) detach(t8);
          if (detaching) detach(button);
          mounted = false;
          run_all(dispose);
        }

      };
    } // (527:4) {#if accomCreatorOpen}


    function create_if_block$2(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_6*/
      ctx[69]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*newAccom, accomContentHighlighted, $settings*/
          1441792 | dirty[2] &
          /*$$scope*/
          524288) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (538:24) {#if accomContentHighlighted}


    function create_if_block_1(ctx) {
      let div;
      let t_value = (
      /*newAccom*/
      ctx[18].content.length ? 1200 -
      /*newAccom*/
      ctx[18].content.length : 1200) + "";
      let t;
      let div_transition;
      let current;
      return {
        c() {
          div = element("div");
          t = text(t_value);
          attr(div, "class", "remaining-characters");
        },

        m(target, anchor) {
          insert(target, div, anchor);
          append(div, t);
          current = true;
        },

        p(ctx, dirty) {
          if ((!current || dirty[0] &
          /*newAccom*/
          262144) && t_value !== (t_value = (
          /*newAccom*/
          ctx[18].content.length ? 1200 -
          /*newAccom*/
          ctx[18].content.length : 1200) + "")) set_data(t, t_value);
        },

        i(local) {
          if (current) return;
          add_render_callback(() => {
            if (!div_transition) div_transition = create_bidirectional_transition(div, scale, {}, true);
            div_transition.run(1);
          });
          current = true;
        },

        o(local) {
          if (!div_transition) div_transition = create_bidirectional_transition(div, scale, {}, false);
          div_transition.run(0);
          current = false;
        },

        d(detaching) {
          if (detaching) detach(div);
          if (detaching && div_transition) div_transition.end();
        }

      };
    } // (528:8) <Modal on:forceClose={()=>{ accomCreatorOpen = false; newAccom = { _id: "", name: "", content: "" } }}>


    function create_default_slot(ctx) {
      let h3;
      let t0_value = formatText(
      /*$settings*/
      ctx[20].services, false, true) + "";
      let t0;
      let t1;
      let t2;
      let form;
      let div0;
      let label0;
      let t4;
      let input;
      let t5;
      let div2;
      let label1;
      let br;
      let t7;
      let div1;
      let t8;
      let textarea;
      let t9;
      let button;
      let current;
      let mounted;
      let dispose;
      let if_block =
      /*accomContentHighlighted*/
      ctx[17] && create_if_block_1(ctx);
      return {
        c() {
          h3 = element("h3");
          t0 = text(t0_value);
          t1 = text(" Details");
          t2 = space();
          form = element("form");
          div0 = element("div");
          label0 = element("label");
          label0.textContent = "Name";
          t4 = space();
          input = element("input");
          t5 = space();
          div2 = element("div");
          label1 = element("label");
          label1.textContent = "Content";
          br = element("br");
          t7 = space();
          div1 = element("div");
          if (if_block) if_block.c();
          t8 = space();
          textarea = element("textarea");
          t9 = space();
          button = element("button");
          button.textContent = "OK";
          attr(h3, "class", "extend svelte-f6g00h");
          attr(label0, "for", "name");
          attr(label0, "class", "svelte-f6g00h");
          attr(input, "type", "text");
          attr(input, "id", "name");
          attr(input, "class", "svelte-f6g00h");
          attr(div0, "class", "form-halves2 svelte-f6g00h");
          attr(label1, "for", "content");
          attr(textarea, "type", "text");
          attr(textarea, "id", "content");
          attr(textarea, "rows", "5");
          attr(textarea, "maxlength", "1200");
          attr(textarea, "class", "svelte-f6g00h");
          attr(div1, "class", "accom-content-wrapper svelte-f6g00h");
          attr(div2, "class", "in");
          attr(button, "class", "centered blue");
          attr(button, "type", "submit");
          attr(form, "id", "new-accom-form");
          attr(form, "class", "svelte-f6g00h");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          append(h3, t0);
          append(h3, t1);
          insert(target, t2, anchor);
          insert(target, form, anchor);
          append(form, div0);
          append(div0, label0);
          append(div0, t4);
          append(div0, input);
          set_input_value(input,
          /*newAccom*/
          ctx[18].name);
          append(form, t5);
          append(form, div2);
          append(div2, label1);
          append(div2, br);
          append(div2, t7);
          append(div2, div1);
          if (if_block) if_block.m(div1, null);
          append(div1, t8);
          append(div1, textarea);
          set_input_value(textarea,
          /*newAccom*/
          ctx[18].content);
          append(form, t9);
          append(form, button);
          current = true;

          if (!mounted) {
            dispose = [listen(input, "input",
            /*input_input_handler*/
            ctx[64]), listen(textarea, "input",
            /*textarea_input_handler_1*/
            ctx[65]), listen(textarea, "focus",
            /*focus_handler_1*/
            ctx[66]), listen(textarea, "blur",
            /*blur_handler_1*/
            ctx[67]), listen(button, "click", prevent_default(
            /*click_handler_13*/
            ctx[68]))];
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if ((!current || dirty[0] &
          /*$settings*/
          1048576) && t0_value !== (t0_value = formatText(
          /*$settings*/
          ctx[20].services, false, true) + "")) set_data(t0, t0_value);

          if (dirty[0] &
          /*newAccom*/
          262144 && input.value !==
          /*newAccom*/
          ctx[18].name) {
            set_input_value(input,
            /*newAccom*/
            ctx[18].name);
          }

          if (
          /*accomContentHighlighted*/
          ctx[17]) {
            if (if_block) {
              if_block.p(ctx, dirty);

              if (dirty[0] &
              /*accomContentHighlighted*/
              131072) {
                transition_in(if_block, 1);
              }
            } else {
              if_block = create_if_block_1(ctx);
              if_block.c();
              transition_in(if_block, 1);
              if_block.m(div1, t8);
            }
          } else if (if_block) {
            group_outros();
            transition_out(if_block, 1, 1, () => {
              if_block = null;
            });
            check_outros();
          }

          if (dirty[0] &
          /*newAccom*/
          262144) {
            set_input_value(textarea,
            /*newAccom*/
            ctx[18].content);
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
          if (detaching) detach(h3);
          if (detaching) detach(t2);
          if (detaching) detach(form);
          if (if_block) if_block.d();
          mounted = false;
          run_all(dispose);
        }

      };
    }

    function create_fragment$7(ctx) {
      let div7;
      let current_block_type_index;
      let if_block0;
      let t0;
      let form;
      let div0;
      let label0;
      let t2;
      let datepicker;
      let updating_selected;
      let t3;
      let h30;
      let t4_value = formatText(
      /*$settings*/
      ctx[20].students, false, true) + "";
      let t4;
      let t5;
      let t6;
      let div1;
      let label1;
      let t8;
      let input0;
      let t9;
      let div2;
      let label2;
      let t11;
      let input1;
      let t12;
      let div3;
      let label3;
      let t14;
      let input2;
      let t15;
      let div4;
      let h31;
      let t16;
      let t17_value = formatText(
      /*$settings*/
      ctx[20].services, true, true) + "";
      let t17;
      let t18;
      let ul;
      let current_block_type_index_1;
      let if_block1;
      let t19;
      let h32;
      let t20_value = formatText(
      /*$settings*/
      ctx[20].students, false, true) + "";
      let t20;
      let t21;
      let t22;
      let div5;
      let t23;
      let textarea;
      let t24;
      let div6;
      let button0;
      let t26;
      let button1;
      let t28;
      let t29;
      let t30;
      let t31;
      let t32;
      let t33;
      let t34;
      let div7_intro;
      let div7_outro;
      let current;
      let mounted;
      let dispose;
      const if_block_creators = [create_if_block_11, create_else_block_2];
      const if_blocks = [];

      function select_block_type(ctx, dirty) {
        if (
        /*LOAnew*/
        ctx[2]) return 0;
        return 1;
      }

      current_block_type_index = select_block_type(ctx);
      if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

      function datepicker_selected_binding(value) {
        /*datepicker_selected_binding*/
        ctx[34](value);
      }

      let datepicker_props = {
        style,
        end: new Date(Date.now()),
        $$slots: {
          default: [create_default_slot_8]
        },
        $$scope: {
          ctx
        }
      };

      if (
      /*dateUpdated*/
      ctx[13] !== void 0) {
        datepicker_props.selected =
        /*dateUpdated*/
        ctx[13];
      }

      datepicker = new Datepicker({
        props: datepicker_props
      });
      binding_callbacks.push(() => bind(datepicker, "selected", datepicker_selected_binding));
      const if_block_creators_1 = [create_if_block_10, create_else_block_1];
      const if_blocks_1 = [];

      function select_block_type_1(ctx, dirty) {
        if (
        /*selectedAccoms*/
        ctx[19].length > 0) return 0;
        return 1;
      }

      current_block_type_index_1 = select_block_type_1(ctx);
      if_block1 = if_blocks_1[current_block_type_index_1] = if_block_creators_1[current_block_type_index_1](ctx);
      let if_block2 =
      /*studentNotesHighlighted*/
      ctx[14] && create_if_block_9(ctx);
      let if_block3 =
      /*showSearchModal*/
      ctx[3] && create_if_block_8(ctx);
      let if_block4 =
      /*showOverwriteModal*/
      ctx[5] && create_if_block_7(ctx);
      let if_block5 =
      /*showSearchListModal*/
      ctx[4] && create_if_block_5(ctx);
      let if_block6 =
      /*showSavedModal*/
      ctx[6] && create_if_block_4(ctx);
      let if_block7 =
      /*showFormErrorModal*/
      ctx[7] && create_if_block_3(ctx);
      let if_block8 =
      /*showAccomsModal*/
      ctx[8] && create_if_block_2(ctx);
      let if_block9 =
      /*accomCreatorOpen*/
      ctx[16] && create_if_block$2(ctx);
      return {
        c() {
          div7 = element("div");
          if_block0.c();
          t0 = space();
          form = element("form");
          div0 = element("div");
          label0 = element("label");
          label0.textContent = "Date";
          t2 = space();
          create_component(datepicker.$$.fragment);
          t3 = space();
          h30 = element("h3");
          t4 = text(t4_value);
          t5 = text(" Information");
          t6 = space();
          div1 = element("div");
          label1 = element("label");
          label1.textContent = "First Name";
          t8 = space();
          input0 = element("input");
          t9 = space();
          div2 = element("div");
          label2 = element("label");
          label2.textContent = "Last Name";
          t11 = space();
          input1 = element("input");
          t12 = space();
          div3 = element("div");
          label3 = element("label");
          label3.textContent = "ID#";
          t14 = space();
          input2 = element("input");
          t15 = space();
          div4 = element("div");
          h31 = element("h3");
          t16 = text("Approved ");
          t17 = text(t17_value);
          t18 = space();
          ul = element("ul");
          if_block1.c();
          t19 = space();
          h32 = element("h3");
          t20 = text(t20_value);
          t21 = text(" Notes");
          t22 = space();
          div5 = element("div");
          if (if_block2) if_block2.c();
          t23 = space();
          textarea = element("textarea");
          t24 = space();
          div6 = element("div");
          button0 = element("button");
          button0.textContent = "Issue";
          t26 = space();
          button1 = element("button");
          button1.textContent = "Clear";
          t28 = space();
          if (if_block3) if_block3.c();
          t29 = space();
          if (if_block4) if_block4.c();
          t30 = space();
          if (if_block5) if_block5.c();
          t31 = space();
          if (if_block6) if_block6.c();
          t32 = space();
          if (if_block7) if_block7.c();
          t33 = space();
          if (if_block8) if_block8.c();
          t34 = space();
          if (if_block9) if_block9.c();
          attr(label0, "for", "issued");
          attr(div0, "class", "form-halves");
          attr(label1, "for", "fname");
          attr(input0, "type", "text");
          attr(input0, "id", "fname");
          attr(input0, "maxlength", "100");
          attr(input0, "class", "svelte-f6g00h");
          attr(div1, "class", "form-halves");
          attr(label2, "for", "lname");
          attr(input1, "type", "text");
          attr(input1, "id", "lname");
          attr(input1, "maxlength", "100");
          attr(input1, "class", "svelte-f6g00h");
          attr(div2, "class", "form-halves");
          attr(label3, "for", "sid");
          attr(input2, "type", "text");
          attr(input2, "id", "sid");
          attr(input2, "maxlength", "20");
          attr(input2, "class", "svelte-f6g00h");
          attr(div3, "class", "form-halves");
          attr(ul, "id", "accoms-list");
          set_style(div4, "position", "relative");
          attr(textarea, "name", "student-notes");
          attr(textarea, "id", "student-notes");
          attr(textarea, "rows", "5");
          attr(textarea, "maxlength", "250");
          attr(textarea, "class", "svelte-f6g00h");
          attr(div5, "id", "student-notes-container");
          attr(div5, "class", "svelte-f6g00h");
          attr(button0, "class", "blue svelte-f6g00h");
          attr(button0, "type", "submit");
          attr(button1, "type", "submit");
          attr(button1, "class", "svelte-f6g00h");
          attr(div6, "class", "inline-buttons svelte-f6g00h");
          set_style(div7, "position", "relative");
        },

        m(target, anchor) {
          insert(target, div7, anchor);
          if_blocks[current_block_type_index].m(div7, null);
          append(div7, t0);
          append(div7, form);
          append(form, div0);
          append(div0, label0);
          append(div0, t2);
          mount_component(datepicker, div0, null);
          append(form, t3);
          append(form, h30);
          append(h30, t4);
          append(h30, t5);
          append(form, t6);
          append(form, div1);
          append(div1, label1);
          append(div1, t8);
          append(div1, input0);
          set_input_value(input0,
          /*student*/
          ctx[10].fname);
          append(form, t9);
          append(form, div2);
          append(div2, label2);
          append(div2, t11);
          append(div2, input1);
          set_input_value(input1,
          /*student*/
          ctx[10].lname);
          append(form, t12);
          append(form, div3);
          append(div3, label3);
          append(div3, t14);
          append(div3, input2);
          set_input_value(input2,
          /*student*/
          ctx[10]._id);
          append(form, t15);
          append(form, div4);
          append(div4, h31);
          append(h31, t16);
          append(h31, t17);
          append(div4, t18);
          append(div4, ul);
          if_blocks_1[current_block_type_index_1].m(ul, null);
          append(form, t19);
          append(form, h32);
          append(h32, t20);
          append(h32, t21);
          append(form, t22);
          append(form, div5);
          if (if_block2) if_block2.m(div5, null);
          append(div5, t23);
          append(div5, textarea);
          /*textarea_binding*/

          ctx[41](textarea);
          set_input_value(textarea,
          /*studentNotes*/
          ctx[12]);
          append(form, t24);
          append(form, div6);
          append(div6, button0);
          append(div6, t26);
          append(div6, button1);
          append(div7, t28);
          if (if_block3) if_block3.m(div7, null);
          append(div7, t29);
          if (if_block4) if_block4.m(div7, null);
          append(div7, t30);
          if (if_block5) if_block5.m(div7, null);
          append(div7, t31);
          if (if_block6) if_block6.m(div7, null);
          append(div7, t32);
          if (if_block7) if_block7.m(div7, null);
          append(div7, t33);
          if (if_block8) if_block8.m(div7, null);
          append(div7, t34);
          if (if_block9) if_block9.m(div7, null);
          current = true;

          if (!mounted) {
            dispose = [listen(input0, "input",
            /*input0_input_handler*/
            ctx[35]), listen(input1, "input",
            /*input1_input_handler*/
            ctx[36]), listen(input2, "input",
            /*input2_input_handler*/
            ctx[37]), listen(textarea, "focus",
            /*focus_handler*/
            ctx[42]), listen(textarea, "blur",
            /*blur_handler*/
            ctx[43]), listen(textarea, "input",
            /*textarea_input_handler*/
            ctx[44]), listen(button0, "click", prevent_default(
            /*click_handler_3*/
            ctx[45])), listen(button1, "click", prevent_default(
            /*click_handler_4*/
            ctx[46]))];
            mounted = true;
          }
        },

        p(ctx, dirty) {
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
            if_block0 = if_blocks[current_block_type_index];

            if (!if_block0) {
              if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
              if_block0.c();
            } else {
              if_block0.p(ctx, dirty);
            }

            transition_in(if_block0, 1);
            if_block0.m(div7, t0);
          }

          const datepicker_changes = {};

          if (dirty[0] &
          /*dateUpdated*/
          8192 | dirty[2] &
          /*$$scope*/
          524288) {
            datepicker_changes.$$scope = {
              dirty,
              ctx
            };
          }

          if (!updating_selected && dirty[0] &
          /*dateUpdated*/
          8192) {
            updating_selected = true;
            datepicker_changes.selected =
            /*dateUpdated*/
            ctx[13];
            add_flush_callback(() => updating_selected = false);
          }

          datepicker.$set(datepicker_changes);
          if ((!current || dirty[0] &
          /*$settings*/
          1048576) && t4_value !== (t4_value = formatText(
          /*$settings*/
          ctx[20].students, false, true) + "")) set_data(t4, t4_value);

          if (dirty[0] &
          /*student*/
          1024 && input0.value !==
          /*student*/
          ctx[10].fname) {
            set_input_value(input0,
            /*student*/
            ctx[10].fname);
          }

          if (dirty[0] &
          /*student*/
          1024 && input1.value !==
          /*student*/
          ctx[10].lname) {
            set_input_value(input1,
            /*student*/
            ctx[10].lname);
          }

          if (dirty[0] &
          /*student*/
          1024 && input2.value !==
          /*student*/
          ctx[10]._id) {
            set_input_value(input2,
            /*student*/
            ctx[10]._id);
          }

          if ((!current || dirty[0] &
          /*$settings*/
          1048576) && t17_value !== (t17_value = formatText(
          /*$settings*/
          ctx[20].services, true, true) + "")) set_data(t17, t17_value);
          let previous_block_index_1 = current_block_type_index_1;
          current_block_type_index_1 = select_block_type_1(ctx);

          if (current_block_type_index_1 === previous_block_index_1) {
            if_blocks_1[current_block_type_index_1].p(ctx, dirty);
          } else {
            group_outros();
            transition_out(if_blocks_1[previous_block_index_1], 1, 1, () => {
              if_blocks_1[previous_block_index_1] = null;
            });
            check_outros();
            if_block1 = if_blocks_1[current_block_type_index_1];

            if (!if_block1) {
              if_block1 = if_blocks_1[current_block_type_index_1] = if_block_creators_1[current_block_type_index_1](ctx);
              if_block1.c();
            } else {
              if_block1.p(ctx, dirty);
            }

            transition_in(if_block1, 1);
            if_block1.m(ul, null);
          }

          if ((!current || dirty[0] &
          /*$settings*/
          1048576) && t20_value !== (t20_value = formatText(
          /*$settings*/
          ctx[20].students, false, true) + "")) set_data(t20, t20_value);

          if (
          /*studentNotesHighlighted*/
          ctx[14]) {
            if (if_block2) {
              if_block2.p(ctx, dirty);

              if (dirty[0] &
              /*studentNotesHighlighted*/
              16384) {
                transition_in(if_block2, 1);
              }
            } else {
              if_block2 = create_if_block_9(ctx);
              if_block2.c();
              transition_in(if_block2, 1);
              if_block2.m(div5, t23);
            }
          } else if (if_block2) {
            group_outros();
            transition_out(if_block2, 1, 1, () => {
              if_block2 = null;
            });
            check_outros();
          }

          if (dirty[0] &
          /*studentNotes*/
          4096) {
            set_input_value(textarea,
            /*studentNotes*/
            ctx[12]);
          }

          if (
          /*showSearchModal*/
          ctx[3]) {
            if (if_block3) {
              if_block3.p(ctx, dirty);

              if (dirty[0] &
              /*showSearchModal*/
              8) {
                transition_in(if_block3, 1);
              }
            } else {
              if_block3 = create_if_block_8(ctx);
              if_block3.c();
              transition_in(if_block3, 1);
              if_block3.m(div7, t29);
            }
          } else if (if_block3) {
            group_outros();
            transition_out(if_block3, 1, 1, () => {
              if_block3 = null;
            });
            check_outros();
          }

          if (
          /*showOverwriteModal*/
          ctx[5]) {
            if (if_block4) {
              if_block4.p(ctx, dirty);

              if (dirty[0] &
              /*showOverwriteModal*/
              32) {
                transition_in(if_block4, 1);
              }
            } else {
              if_block4 = create_if_block_7(ctx);
              if_block4.c();
              transition_in(if_block4, 1);
              if_block4.m(div7, t30);
            }
          } else if (if_block4) {
            group_outros();
            transition_out(if_block4, 1, 1, () => {
              if_block4 = null;
            });
            check_outros();
          }

          if (
          /*showSearchListModal*/
          ctx[4]) {
            if (if_block5) {
              if_block5.p(ctx, dirty);

              if (dirty[0] &
              /*showSearchListModal*/
              16) {
                transition_in(if_block5, 1);
              }
            } else {
              if_block5 = create_if_block_5(ctx);
              if_block5.c();
              transition_in(if_block5, 1);
              if_block5.m(div7, t31);
            }
          } else if (if_block5) {
            group_outros();
            transition_out(if_block5, 1, 1, () => {
              if_block5 = null;
            });
            check_outros();
          }

          if (
          /*showSavedModal*/
          ctx[6]) {
            if (if_block6) {
              if_block6.p(ctx, dirty);

              if (dirty[0] &
              /*showSavedModal*/
              64) {
                transition_in(if_block6, 1);
              }
            } else {
              if_block6 = create_if_block_4(ctx);
              if_block6.c();
              transition_in(if_block6, 1);
              if_block6.m(div7, t32);
            }
          } else if (if_block6) {
            group_outros();
            transition_out(if_block6, 1, 1, () => {
              if_block6 = null;
            });
            check_outros();
          }

          if (
          /*showFormErrorModal*/
          ctx[7]) {
            if (if_block7) {
              if_block7.p(ctx, dirty);

              if (dirty[0] &
              /*showFormErrorModal*/
              128) {
                transition_in(if_block7, 1);
              }
            } else {
              if_block7 = create_if_block_3(ctx);
              if_block7.c();
              transition_in(if_block7, 1);
              if_block7.m(div7, t33);
            }
          } else if (if_block7) {
            group_outros();
            transition_out(if_block7, 1, 1, () => {
              if_block7 = null;
            });
            check_outros();
          }

          if (
          /*showAccomsModal*/
          ctx[8]) {
            if (if_block8) {
              if_block8.p(ctx, dirty);

              if (dirty[0] &
              /*showAccomsModal*/
              256) {
                transition_in(if_block8, 1);
              }
            } else {
              if_block8 = create_if_block_2(ctx);
              if_block8.c();
              transition_in(if_block8, 1);
              if_block8.m(div7, t34);
            }
          } else if (if_block8) {
            group_outros();
            transition_out(if_block8, 1, 1, () => {
              if_block8 = null;
            });
            check_outros();
          }

          if (
          /*accomCreatorOpen*/
          ctx[16]) {
            if (if_block9) {
              if_block9.p(ctx, dirty);

              if (dirty[0] &
              /*accomCreatorOpen*/
              65536) {
                transition_in(if_block9, 1);
              }
            } else {
              if_block9 = create_if_block$2(ctx);
              if_block9.c();
              transition_in(if_block9, 1);
              if_block9.m(div7, null);
            }
          } else if (if_block9) {
            group_outros();
            transition_out(if_block9, 1, 1, () => {
              if_block9 = null;
            });
            check_outros();
          }
        },

        i(local) {
          if (current) return;
          transition_in(if_block0);
          transition_in(datepicker.$$.fragment, local);
          transition_in(if_block1);
          transition_in(if_block2);
          transition_in(if_block3);
          transition_in(if_block4);
          transition_in(if_block5);
          transition_in(if_block6);
          transition_in(if_block7);
          transition_in(if_block8);
          transition_in(if_block9);
          add_render_callback(() => {
            if (div7_outro) div7_outro.end(1);
            if (!div7_intro) div7_intro = create_in_transition(div7, fly, {
              x: 100,
              delay: 500
            });
            div7_intro.start();
          });
          current = true;
        },

        o(local) {
          transition_out(if_block0);
          transition_out(datepicker.$$.fragment, local);
          transition_out(if_block1);
          transition_out(if_block2);
          transition_out(if_block3);
          transition_out(if_block4);
          transition_out(if_block5);
          transition_out(if_block6);
          transition_out(if_block7);
          transition_out(if_block8);
          transition_out(if_block9);
          if (div7_intro) div7_intro.invalidate();
          div7_outro = create_out_transition(div7, fly, {
            x: 100
          });
          current = false;
        },

        d(detaching) {
          if (detaching) detach(div7);
          if_blocks[current_block_type_index].d();
          destroy_component(datepicker);
          if_blocks_1[current_block_type_index_1].d();
          if (if_block2) if_block2.d();
          /*textarea_binding*/

          ctx[41](null);
          if (if_block3) if_block3.d();
          if (if_block4) if_block4.d();
          if (if_block5) if_block5.d();
          if (if_block6) if_block6.d();
          if (if_block7) if_block7.d();
          if (if_block8) if_block8.d();
          if (if_block9) if_block9.d();
          if (detaching && div7_outro) div7_outro.end();
          mounted = false;
          run_all(dispose);
        }

      };
    }
    let style = "margin: 0;";

    function instance$7($$self, $$props, $$invalidate) {
      let selectedAccoms;
      let $settings;
      component_subscribe($$self, settings, $$value => $$invalidate(20, $settings = $$value));
      const dispatch = createEventDispatcher(); //This takes element position into account

      function flyModified(node, {
        delay = 0,
        duration = 400,
        easing = cubicOut$1,
        x = 0,
        y = 0,
        position = "relative"
      }) {
        const style = getComputedStyle(node);
        const opacity = +style.opacity;
        const transform = style.transform === "none" ? "" : style.transform;
        return {
          delay,
          duration,
          easing,
          css: t => `
            transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
            opacity: ${t * opacity};
            position: ${position};`
        };
      }

      class extDate extends Date {
        addDays(days) {
          let date = new extDate(this.valueOf());
          date.setDate(date.getDate() + days);
          return date;
        }

      }

      let LOAnew = true;
      let showSearchModal = false;
      let showSearchListModal = false;
      let showOverwriteModal = false;
      let showSavedModal = false;
      let showFormErrorModal = false;
      let showAccomsModal = false;
      let searchResults = [];
      let student = {
        fname: "",
        lname: "",
        _id: ""
      };
      let searchStud = {
        fname: "",
        lname: "",
        _id: ""
      };
      let accoms = [];
      let customAccoms = [];
      let studentNotes = "";
      let dateIssued = new Date(Date.now());
      let dateIssuedNext = dateIssued;
      let dateUpdated = new Date(Date.now());

      let sortAccoms = ev => {
        $$invalidate(19, selectedAccoms = ev.detail);
      };

      let studentNotesHighlighted = false;
      let months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "November", "December"];
      let studentNotesTextarea = null;

      let writeNewLOA = () => {
        $$invalidate(3, showSearchModal = false);
        clear();
      };

      let searchForStudent = () => {
        $$invalidate(11, searchStud = {
          fname: "",
          lname: "",
          _id: ""
        });
        $$invalidate(3, showSearchModal = true);
      };

      let save = (upsert = false) => {
        //Trim and uc relevant form fields
        $$invalidate(10, student.lname = student.lname.trim(), student);
        $$invalidate(10, student.fname = student.fname.trim(), student);
        $$invalidate(10, student.lname = student.lname.substr(0, 1).toUpperCase() + student.lname.substr(1), student);
        $$invalidate(10, student.fname = student.fname.substr(0, 1).toUpperCase() + student.fname.substr(1), student); //Validate form first!

        if (student.fname.length < 2 || student.lname.length < 2 || student._id.length < 2 || accoms.length < 1) {
          $$invalidate(7, showFormErrorModal = true);
          return;
        }

        if (!upsert) {
          loadLOA(student, $settings.databasedir).then(existing => {
            if (existing != null) {
              $$invalidate(5, showOverwriteModal = true);
            } else {
              saveLOA({
                student,
                accoms: selectedAccoms,
                studentNotes,
                dateUpdated,
                dateIssued
              }, $settings.databasedir).then(() => {
                $$invalidate(6, showSavedModal = true);
              });
            }
          });
        } else saveLOA({
          student,
          accoms: selectedAccoms,
          studentNotes,
          dateUpdated,
          dateIssued
        }, $settings.databasedir).then(() => {
          $$invalidate(6, showSavedModal = true);
        }).catch(e => {
          alert(e);
        });
      };

      let endSave = () => {
        clear();
        $$invalidate(6, showSavedModal = false);
      };

      let loadStudent = inputstudent => {
        loadLOA(inputstudent, $settings.databasedir).then(result => {
          $$invalidate(10, student = result.student || {}); //Value to store accommodations not in db (custom)

          $$invalidate(1, customAccoms = []); //Check through accommodations list and set selected if found in result.accoms

          accoms.forEach(accom => {
            accom.selected = (() => {
              let returnVal = false;

              if (result.accoms) {
                result.accoms.forEach(raccom => {
                  if (accom._id == raccom._id) {
                    returnVal = true;
                  }
                });
              }

              return returnVal;
            })();
          }); //Check through loaded accoms and add to customAccoms if necessary

          result.accoms.forEach(raccom => {
            if (/CUSTOM-/.test(raccom._id)) {
              customAccoms.push(_objectSpread(_objectSpread({}, raccom), {}, {
                selected: true
              }));
            }
          });
          $$invalidate(19, selectedAccoms = [...customAccoms, ...accoms.filter(accom => {
            return accom.selected === true;
          })]);
          $$invalidate(12, studentNotes = result.studentNotes || "");
          $$invalidate(33, dateIssued = result.dateIssued || new Date());
          $$invalidate(13, dateUpdated = result.dateUpdated || new Date());
          $$invalidate(2, LOAnew = false);
          $$invalidate(4, showSearchListModal = false);
        });
      };

      let search = () => {
        searchLOA(searchStud, $settings.databasedir).then(value => {
          $$invalidate(9, searchResults = value);
          $$invalidate(3, showSearchModal = false);
          $$invalidate(4, showSearchListModal = true);
        });
      };

      let clear = () => {
        $$invalidate(10, student = {
          fname: "",
          lname: "",
          _id: ""
        });
        accoms.forEach(accom => {
          accom.selected = false;
        });
        $$invalidate(19, selectedAccoms = []);
        $$invalidate(12, studentNotes = "");
        $$invalidate(1, customAccoms = []);
        $$invalidate(2, LOAnew = true);
        $$invalidate(33, dateIssued = new Date(Date.now()));
        $$invalidate(13, dateUpdated = new Date(Date.now()));
        dispatch("scrollUp");
      };

      onMount(() => {
        loadAccommodations($settings.databasedir).then(loadedAccoms => {
          $$invalidate(0, accoms = loadedAccoms);
        });
      });
      let accomCreatorOpen = false;
      let accomContentHighlighted = false;
      let newAccom = {};

      let addCustomAccom = () => {
        $$invalidate(8, showAccomsModal = false);
        $$invalidate(18, newAccom = {
          name: "",
          content: "",
          selected: true
        });
        $$invalidate(16, accomCreatorOpen = true);
      };

      let setCustomAccom = () => {
        $$invalidate(16, accomCreatorOpen = false);
        customAccoms.push(_objectSpread(_objectSpread({}, newAccom), {}, {
          _id: "CUSTOM-" + accoms.length + 1
        }));
        $$invalidate(1, customAccoms);
      };

      function datepicker_selected_binding(value) {
        dateUpdated = value;
        $$invalidate(13, dateUpdated);
      }

      function input0_input_handler() {
        student.fname = this.value;
        $$invalidate(10, student);
      }

      function input1_input_handler() {
        student.lname = this.value;
        $$invalidate(10, student);
      }

      function input2_input_handler() {
        student._id = this.value;
        $$invalidate(10, student);
      }

      const click_handler = item => {
        item.selected = false;
        $$invalidate(0, accoms);
      };

      const click_handler_1 = () => {
        $$invalidate(8, showAccomsModal = true);
      };

      const click_handler_2 = () => {
        $$invalidate(8, showAccomsModal = true);
      };

      function textarea_binding($$value) {
        binding_callbacks[$$value ? "unshift" : "push"](() => {
          studentNotesTextarea = $$value;
          $$invalidate(15, studentNotesTextarea);
        });
      }

      const focus_handler = () => {
        $$invalidate(14, studentNotesHighlighted = true);
      };

      const blur_handler = () => {
        $$invalidate(14, studentNotesHighlighted = false);
      };

      function textarea_input_handler() {
        studentNotes = this.value;
        $$invalidate(12, studentNotes);
      }

      const click_handler_3 = () => {
        save();
      };

      const click_handler_4 = () => {
        clear();
      };

      function input0_input_handler_1() {
        searchStud._id = this.value;
        $$invalidate(11, searchStud);
      }

      function input1_input_handler_1() {
        searchStud.fname = this.value;
        $$invalidate(11, searchStud);
      }

      function input2_input_handler_1() {
        searchStud.lname = this.value;
        $$invalidate(11, searchStud);
      }

      const forceClose_handler = () => {
        $$invalidate(3, showSearchModal = false);
      };

      const click_handler_5 = () => {
        save(true);
        $$invalidate(5, showOverwriteModal = false);
      };

      const click_handler_6 = () => {
        $$invalidate(5, showOverwriteModal = false);
      };

      const forceClose_handler_1 = () => {
        $$invalidate(5, showOverwriteModal = false);
      };

      const click_handler_7 = result => {
        loadStudent(result.student);
      };

      const click_handler_8 = () => {
        $$invalidate(4, showSearchListModal = false);
        $$invalidate(3, showSearchModal = true);
      };

      const forceClose_handler_2 = () => {
        $$invalidate(4, showSearchListModal = false);
      };

      const click_handler_9 = () => {
        endSave();
      };

      const forceClose_handler_3 = () => {
        endSave();
      };

      const click_handler_10 = () => {
        $$invalidate(7, showFormErrorModal = false);
      };

      const forceClose_handler_4 = () => {
        $$invalidate(7, showFormErrorModal = false);
      };

      const click_handler_11 = (accom, each_value, accom_index) => {
        $$invalidate(0, each_value[accom_index].selected = !accom.selected, accoms, $$invalidate(1, customAccoms));
      };

      const click_handler_12 = () => {
        $$invalidate(8, showAccomsModal = false);
      };

      const forceClose_handler_5 = () => {
        $$invalidate(8, showAccomsModal = false);
      };

      function input_input_handler() {
        newAccom.name = this.value;
        $$invalidate(18, newAccom);
      }

      function textarea_input_handler_1() {
        newAccom.content = this.value;
        $$invalidate(18, newAccom);
      }

      const focus_handler_1 = () => {
        $$invalidate(17, accomContentHighlighted = true);
      };

      const blur_handler_1 = () => {
        $$invalidate(17, accomContentHighlighted = false);
      };

      const click_handler_13 = () => {
        setCustomAccom();
      };

      const forceClose_handler_6 = () => {
        $$invalidate(16, accomCreatorOpen = false);
        $$invalidate(18, newAccom = {
          _id: "",
          name: "",
          content: ""
        });
      };

      $$self.$$.update = () => {
        if ($$self.$$.dirty[1] &
        /*dateIssued*/
        4) {
           dateIssuedNext = new extDate(dateIssued).addDays(1);
        }

        if ($$self.$$.dirty[0] &
        /*accoms, customAccoms*/
        3) {
           $$invalidate(19, selectedAccoms = [...(accoms.length ? accoms.filter(accom => {
            return accom.selected === true;
          }) : []), ...customAccoms.filter(accom => {
            return accom.selected === true;
          })]);
        }
      };

      return [accoms, customAccoms, LOAnew, showSearchModal, showSearchListModal, showOverwriteModal, showSavedModal, showFormErrorModal, showAccomsModal, searchResults, student, searchStud, studentNotes, dateUpdated, studentNotesHighlighted, studentNotesTextarea, accomCreatorOpen, accomContentHighlighted, newAccom, selectedAccoms, $settings, flyModified, sortAccoms, months, writeNewLOA, searchForStudent, save, endSave, loadStudent, search, clear, addCustomAccom, setCustomAccom, dateIssued, datepicker_selected_binding, input0_input_handler, input1_input_handler, input2_input_handler, click_handler, click_handler_1, click_handler_2, textarea_binding, focus_handler, blur_handler, textarea_input_handler, click_handler_3, click_handler_4, input0_input_handler_1, input1_input_handler_1, input2_input_handler_1, forceClose_handler, click_handler_5, click_handler_6, forceClose_handler_1, click_handler_7, click_handler_8, forceClose_handler_2, click_handler_9, forceClose_handler_3, click_handler_10, forceClose_handler_4, click_handler_11, click_handler_12, forceClose_handler_5, input_input_handler, textarea_input_handler_1, focus_handler_1, blur_handler_1, click_handler_13, forceClose_handler_6];
    }

    class Write extends SvelteComponent {
      constructor(options) {
        super();
        init(this, options, instance$7, create_fragment$7, safe_not_equal, {}, [-1, -1, -1]);
      }

    }

    var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

    function getDefaultExportFromCjs (x) {
    	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
    }

    function createCommonjsModule(fn) {
      var module = { exports: {} };
    	return fn(module, module.exports), module.exports;
    }

    /*!
     * Fuse.js v3.6.1 - Lightweight fuzzy-search (http://fusejs.io)
     * 
     * Copyright (c) 2012-2017 Kirollos Risk (http://kiro.me)
     * All Rights Reserved. Apache Software License 2.0
     * 
     * http://www.apache.org/licenses/LICENSE-2.0
     */

    var fuse = createCommonjsModule(function (module, exports) {
    !function (e, t) {
       module.exports = t() ;
    }(commonjsGlobal, function () {
      return function (e) {
        var t = {};

        function r(n) {
          if (t[n]) return t[n].exports;
          var o = t[n] = {
            i: n,
            l: !1,
            exports: {}
          };
          return e[n].call(o.exports, o, o.exports, r), o.l = !0, o.exports;
        }

        return r.m = e, r.c = t, r.d = function (e, t, n) {
          r.o(e, t) || Object.defineProperty(e, t, {
            enumerable: !0,
            get: n
          });
        }, r.r = function (e) {
          "undefined" != typeof Symbol && Symbol.toStringTag && Object.defineProperty(e, Symbol.toStringTag, {
            value: "Module"
          }), Object.defineProperty(e, "__esModule", {
            value: !0
          });
        }, r.t = function (e, t) {
          if (1 & t && (e = r(e)), 8 & t) return e;
          if (4 & t && "object" == typeof e && e && e.__esModule) return e;
          var n = Object.create(null);
          if (r.r(n), Object.defineProperty(n, "default", {
            enumerable: !0,
            value: e
          }), 2 & t && "string" != typeof e) for (var o in e) r.d(n, o, function (t) {
            return e[t];
          }.bind(null, o));
          return n;
        }, r.n = function (e) {
          var t = e && e.__esModule ? function () {
            return e.default;
          } : function () {
            return e;
          };
          return r.d(t, "a", t), t;
        }, r.o = function (e, t) {
          return Object.prototype.hasOwnProperty.call(e, t);
        }, r.p = "", r(r.s = 0);
      }([function (e, t, r) {
        function n(e) {
          return (n = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (e) {
            return typeof e;
          } : function (e) {
            return e && "function" == typeof Symbol && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
          })(e);
        }

        function o(e, t) {
          for (var r = 0; r < t.length; r++) {
            var n = t[r];
            n.enumerable = n.enumerable || !1, n.configurable = !0, "value" in n && (n.writable = !0), Object.defineProperty(e, n.key, n);
          }
        }

        var i = r(1),
            a = r(7),
            s = a.get,
            c = (a.deepValue, a.isArray),
            h = function () {
          function e(t, r) {
            var n = r.location,
                o = void 0 === n ? 0 : n,
                i = r.distance,
                a = void 0 === i ? 100 : i,
                c = r.threshold,
                h = void 0 === c ? .6 : c,
                l = r.maxPatternLength,
                u = void 0 === l ? 32 : l,
                f = r.caseSensitive,
                v = void 0 !== f && f,
                p = r.tokenSeparator,
                d = void 0 === p ? / +/g : p,
                g = r.findAllMatches,
                y = void 0 !== g && g,
                m = r.minMatchCharLength,
                k = void 0 === m ? 1 : m,
                b = r.id,
                S = void 0 === b ? null : b,
                x = r.keys,
                M = void 0 === x ? [] : x,
                _ = r.shouldSort,
                w = void 0 === _ || _,
                L = r.getFn,
                A = void 0 === L ? s : L,
                O = r.sortFn,
                C = void 0 === O ? function (e, t) {
              return e.score - t.score;
            } : O,
                j = r.tokenize,
                P = void 0 !== j && j,
                I = r.matchAllTokens,
                F = void 0 !== I && I,
                T = r.includeMatches,
                N = void 0 !== T && T,
                z = r.includeScore,
                E = void 0 !== z && z,
                W = r.verbose,
                K = void 0 !== W && W;
            !function (e, t) {
              if (!(e instanceof t)) throw new TypeError("Cannot call a class as a function");
            }(this, e), this.options = {
              location: o,
              distance: a,
              threshold: h,
              maxPatternLength: u,
              isCaseSensitive: v,
              tokenSeparator: d,
              findAllMatches: y,
              minMatchCharLength: k,
              id: S,
              keys: M,
              includeMatches: N,
              includeScore: E,
              shouldSort: w,
              getFn: A,
              sortFn: C,
              verbose: K,
              tokenize: P,
              matchAllTokens: F
            }, this.setCollection(t), this._processKeys(M);
          }

          var t, r;
          return t = e, (r = [{
            key: "setCollection",
            value: function (e) {
              return this.list = e, e;
            }
          }, {
            key: "_processKeys",
            value: function (e) {
              if (this._keyWeights = {}, this._keyNames = [], e.length && "string" == typeof e[0]) for (var t = 0, r = e.length; t < r; t += 1) {
                var n = e[t];
                this._keyWeights[n] = 1, this._keyNames.push(n);
              } else {
                for (var a = 0, s = 0, c = e.length; s < c; s += 1) {
                  var h = e[s];
                  if (!h.hasOwnProperty("name")) throw new Error('Missing "name" property in key object');
                  var l = h.name;
                  if (this._keyNames.push(l), !h.hasOwnProperty("weight")) throw new Error('Missing "weight" property in key object');
                  var u = h.weight;
                  if (u < 0 || u > 1) throw new Error('"weight" property in key must bein the range of [0, 1)');
                  this._keyWeights[l] = u, a += u;
                }

                if (a > 1) throw new Error("Total of weights cannot exceed 1");
              }
            }
          }, {
            key: "search",
            value: function (e) {
              var t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {
                limit: !1
              };

              this._log('---------\nSearch pattern: "'.concat(e, '"'));

              var r = this._prepareSearchers(e),
                  n = r.tokenSearchers,
                  o = r.fullSearcher,
                  i = this._search(n, o);

              return this._computeScore(i), this.options.shouldSort && this._sort(i), t.limit && "number" == typeof t.limit && (i = i.slice(0, t.limit)), this._format(i);
            }
          }, {
            key: "_prepareSearchers",
            value: function () {
              var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "",
                  t = [];
              if (this.options.tokenize) for (var r = e.split(this.options.tokenSeparator), n = 0, o = r.length; n < o; n += 1) t.push(new i(r[n], this.options));
              return {
                tokenSearchers: t,
                fullSearcher: new i(e, this.options)
              };
            }
          }, {
            key: "_search",
            value: function () {
              var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : [],
                  t = arguments.length > 1 ? arguments[1] : void 0,
                  r = this.list,
                  n = {},
                  o = [];

              if ("string" == typeof r[0]) {
                for (var i = 0, a = r.length; i < a; i += 1) this._analyze({
                  key: "",
                  value: r[i],
                  record: i,
                  index: i
                }, {
                  resultMap: n,
                  results: o,
                  tokenSearchers: e,
                  fullSearcher: t
                });

                return o;
              }

              for (var s = 0, c = r.length; s < c; s += 1) for (var h = r[s], l = 0, u = this._keyNames.length; l < u; l += 1) {
                var f = this._keyNames[l];

                this._analyze({
                  key: f,
                  value: this.options.getFn(h, f),
                  record: h,
                  index: s
                }, {
                  resultMap: n,
                  results: o,
                  tokenSearchers: e,
                  fullSearcher: t
                });
              }

              return o;
            }
          }, {
            key: "_analyze",
            value: function (e, t) {
              var r = this,
                  n = e.key,
                  o = e.arrayIndex,
                  i = void 0 === o ? -1 : o,
                  a = e.value,
                  s = e.record,
                  h = e.index,
                  l = t.tokenSearchers,
                  u = void 0 === l ? [] : l,
                  f = t.fullSearcher,
                  v = t.resultMap,
                  p = void 0 === v ? {} : v,
                  d = t.results,
                  g = void 0 === d ? [] : d;
              !function e(t, o, i, a) {
                if (null != o) if ("string" == typeof o) {
                  var s = !1,
                      h = -1,
                      l = 0;

                  r._log("\nKey: ".concat("" === n ? "--" : n));

                  var v = f.search(o);

                  if (r._log('Full text: "'.concat(o, '", score: ').concat(v.score)), r.options.tokenize) {
                    for (var d = o.split(r.options.tokenSeparator), y = d.length, m = [], k = 0, b = u.length; k < b; k += 1) {
                      var S = u[k];

                      r._log('\nPattern: "'.concat(S.pattern, '"'));

                      for (var x = !1, M = 0; M < y; M += 1) {
                        var _ = d[M],
                            w = S.search(_),
                            L = {};
                        w.isMatch ? (L[_] = w.score, s = !0, x = !0, m.push(w.score)) : (L[_] = 1, r.options.matchAllTokens || m.push(1)), r._log('Token: "'.concat(_, '", score: ').concat(L[_]));
                      }

                      x && (l += 1);
                    }

                    h = m[0];

                    for (var A = m.length, O = 1; O < A; O += 1) h += m[O];

                    h /= A, r._log("Token score average:", h);
                  }

                  var C = v.score;
                  h > -1 && (C = (C + h) / 2), r._log("Score average:", C);
                  var j = !r.options.tokenize || !r.options.matchAllTokens || l >= u.length;

                  if (r._log("\nCheck Matches: ".concat(j)), (s || v.isMatch) && j) {
                    var P = {
                      key: n,
                      arrayIndex: t,
                      value: o,
                      score: C
                    };
                    r.options.includeMatches && (P.matchedIndices = v.matchedIndices);
                    var I = p[a];
                    I ? I.output.push(P) : (p[a] = {
                      item: i,
                      output: [P]
                    }, g.push(p[a]));
                  }
                } else if (c(o)) for (var F = 0, T = o.length; F < T; F += 1) e(F, o[F], i, a);
              }(i, a, s, h);
            }
          }, {
            key: "_computeScore",
            value: function (e) {
              this._log("\n\nComputing score:\n");

              for (var t = this._keyWeights, r = !!Object.keys(t).length, n = 0, o = e.length; n < o; n += 1) {
                for (var i = e[n], a = i.output, s = a.length, c = 1, h = 0; h < s; h += 1) {
                  var l = a[h],
                      u = l.key,
                      f = r ? t[u] : 1,
                      v = 0 === l.score && t && t[u] > 0 ? Number.EPSILON : l.score;
                  c *= Math.pow(v, f);
                }

                i.score = c, this._log(i);
              }
            }
          }, {
            key: "_sort",
            value: function (e) {
              this._log("\n\nSorting...."), e.sort(this.options.sortFn);
            }
          }, {
            key: "_format",
            value: function (e) {
              var t = [];

              if (this.options.verbose) {
                var r = [];
                this._log("\n\nOutput:\n\n", JSON.stringify(e, function (e, t) {
                  if ("object" === n(t) && null !== t) {
                    if (-1 !== r.indexOf(t)) return;
                    r.push(t);
                  }

                  return t;
                }, 2)), r = null;
              }

              var o = [];
              this.options.includeMatches && o.push(function (e, t) {
                var r = e.output;
                t.matches = [];

                for (var n = 0, o = r.length; n < o; n += 1) {
                  var i = r[n];

                  if (0 !== i.matchedIndices.length) {
                    var a = {
                      indices: i.matchedIndices,
                      value: i.value
                    };
                    i.key && (a.key = i.key), i.hasOwnProperty("arrayIndex") && i.arrayIndex > -1 && (a.arrayIndex = i.arrayIndex), t.matches.push(a);
                  }
                }
              }), this.options.includeScore && o.push(function (e, t) {
                t.score = e.score;
              });

              for (var i = 0, a = e.length; i < a; i += 1) {
                var s = e[i];

                if (this.options.id && (s.item = this.options.getFn(s.item, this.options.id)[0]), o.length) {
                  for (var c = {
                    item: s.item
                  }, h = 0, l = o.length; h < l; h += 1) o[h](s, c);

                  t.push(c);
                } else t.push(s.item);
              }

              return t;
            }
          }, {
            key: "_log",
            value: function () {
              var e;
              this.options.verbose && (e = console).log.apply(e, arguments);
            }
          }]) && o(t.prototype, r), e;
        }();

        e.exports = h;
      }, function (e, t, r) {
        function n(e, t) {
          for (var r = 0; r < t.length; r++) {
            var n = t[r];
            n.enumerable = n.enumerable || !1, n.configurable = !0, "value" in n && (n.writable = !0), Object.defineProperty(e, n.key, n);
          }
        }

        var o = r(2),
            i = r(3),
            a = r(6),
            s = function () {
          function e(t, r) {
            var n = r.location,
                o = void 0 === n ? 0 : n,
                i = r.distance,
                s = void 0 === i ? 100 : i,
                c = r.threshold,
                h = void 0 === c ? .6 : c,
                l = r.maxPatternLength,
                u = void 0 === l ? 32 : l,
                f = r.isCaseSensitive,
                v = void 0 !== f && f,
                p = r.tokenSeparator,
                d = void 0 === p ? / +/g : p,
                g = r.findAllMatches,
                y = void 0 !== g && g,
                m = r.minMatchCharLength,
                k = void 0 === m ? 1 : m,
                b = r.includeMatches,
                S = void 0 !== b && b;
            !function (e, t) {
              if (!(e instanceof t)) throw new TypeError("Cannot call a class as a function");
            }(this, e), this.options = {
              location: o,
              distance: s,
              threshold: h,
              maxPatternLength: u,
              isCaseSensitive: v,
              tokenSeparator: d,
              findAllMatches: y,
              includeMatches: S,
              minMatchCharLength: k
            }, this.pattern = v ? t : t.toLowerCase(), this.pattern.length <= u && (this.patternAlphabet = a(this.pattern));
          }

          var t, r;
          return t = e, (r = [{
            key: "search",
            value: function (e) {
              var t = this.options,
                  r = t.isCaseSensitive,
                  n = t.includeMatches;

              if (r || (e = e.toLowerCase()), this.pattern === e) {
                var a = {
                  isMatch: !0,
                  score: 0
                };
                return n && (a.matchedIndices = [[0, e.length - 1]]), a;
              }

              var s = this.options,
                  c = s.maxPatternLength,
                  h = s.tokenSeparator;
              if (this.pattern.length > c) return o(e, this.pattern, h);
              var l = this.options,
                  u = l.location,
                  f = l.distance,
                  v = l.threshold,
                  p = l.findAllMatches,
                  d = l.minMatchCharLength;
              return i(e, this.pattern, this.patternAlphabet, {
                location: u,
                distance: f,
                threshold: v,
                findAllMatches: p,
                minMatchCharLength: d,
                includeMatches: n
              });
            }
          }]) && n(t.prototype, r), e;
        }();

        e.exports = s;
      }, function (e, t) {
        var r = /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g;

        e.exports = function (e, t) {
          var n = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : / +/g,
              o = new RegExp(t.replace(r, "\\$&").replace(n, "|")),
              i = e.match(o),
              a = !!i,
              s = [];
          if (a) for (var c = 0, h = i.length; c < h; c += 1) {
            var l = i[c];
            s.push([e.indexOf(l), l.length - 1]);
          }
          return {
            score: a ? .5 : 1,
            isMatch: a,
            matchedIndices: s
          };
        };
      }, function (e, t, r) {
        var n = r(4),
            o = r(5);

        e.exports = function (e, t, r, i) {
          for (var a = i.location, s = void 0 === a ? 0 : a, c = i.distance, h = void 0 === c ? 100 : c, l = i.threshold, u = void 0 === l ? .6 : l, f = i.findAllMatches, v = void 0 !== f && f, p = i.minMatchCharLength, d = void 0 === p ? 1 : p, g = i.includeMatches, y = void 0 !== g && g, m = s, k = e.length, b = u, S = e.indexOf(t, m), x = t.length, M = [], _ = 0; _ < k; _ += 1) M[_] = 0;

          if (-1 !== S) {
            var w = n(t, {
              errors: 0,
              currentLocation: S,
              expectedLocation: m,
              distance: h
            });

            if (b = Math.min(w, b), -1 !== (S = e.lastIndexOf(t, m + x))) {
              var L = n(t, {
                errors: 0,
                currentLocation: S,
                expectedLocation: m,
                distance: h
              });
              b = Math.min(L, b);
            }
          }

          S = -1;

          for (var A = [], O = 1, C = x + k, j = 1 << (x <= 31 ? x - 1 : 30), P = 0; P < x; P += 1) {
            for (var I = 0, F = C; I < F;) {
              n(t, {
                errors: P,
                currentLocation: m + F,
                expectedLocation: m,
                distance: h
              }) <= b ? I = F : C = F, F = Math.floor((C - I) / 2 + I);
            }

            C = F;
            var T = Math.max(1, m - F + 1),
                N = v ? k : Math.min(m + F, k) + x,
                z = Array(N + 2);
            z[N + 1] = (1 << P) - 1;

            for (var E = N; E >= T; E -= 1) {
              var W = E - 1,
                  K = r[e.charAt(W)];

              if (K && (M[W] = 1), z[E] = (z[E + 1] << 1 | 1) & K, 0 !== P && (z[E] |= (A[E + 1] | A[E]) << 1 | 1 | A[E + 1]), z[E] & j && (O = n(t, {
                errors: P,
                currentLocation: W,
                expectedLocation: m,
                distance: h
              })) <= b) {
                if (b = O, (S = W) <= m) break;
                T = Math.max(1, 2 * m - S);
              }
            }

            if (n(t, {
              errors: P + 1,
              currentLocation: m,
              expectedLocation: m,
              distance: h
            }) > b) break;
            A = z;
          }

          var $ = {
            isMatch: S >= 0,
            score: 0 === O ? .001 : O
          };
          return y && ($.matchedIndices = o(M, d)), $;
        };
      }, function (e, t) {
        e.exports = function (e, t) {
          var r = t.errors,
              n = void 0 === r ? 0 : r,
              o = t.currentLocation,
              i = void 0 === o ? 0 : o,
              a = t.expectedLocation,
              s = void 0 === a ? 0 : a,
              c = t.distance,
              h = void 0 === c ? 100 : c,
              l = n / e.length,
              u = Math.abs(s - i);
          return h ? l + u / h : u ? 1 : l;
        };
      }, function (e, t) {
        e.exports = function () {
          for (var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : [], t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 1, r = [], n = -1, o = -1, i = 0, a = e.length; i < a; i += 1) {
            var s = e[i];
            s && -1 === n ? n = i : s || -1 === n || ((o = i - 1) - n + 1 >= t && r.push([n, o]), n = -1);
          }

          return e[i - 1] && i - n >= t && r.push([n, i - 1]), r;
        };
      }, function (e, t) {
        e.exports = function (e) {
          for (var t = {}, r = e.length, n = 0; n < r; n += 1) t[e.charAt(n)] = 0;

          for (var o = 0; o < r; o += 1) t[e.charAt(o)] |= 1 << r - o - 1;

          return t;
        };
      }, function (e, t) {
        var r = function (e) {
          return Array.isArray ? Array.isArray(e) : "[object Array]" === Object.prototype.toString.call(e);
        },
            n = function (e) {
          return null == e ? "" : function (e) {
            if ("string" == typeof e) return e;
            var t = e + "";
            return "0" == t && 1 / e == -1 / 0 ? "-0" : t;
          }(e);
        },
            o = function (e) {
          return "string" == typeof e;
        },
            i = function (e) {
          return "number" == typeof e;
        };

        e.exports = {
          get: function (e, t) {
            var a = [];
            return function e(t, s) {
              if (s) {
                var c = s.indexOf("."),
                    h = s,
                    l = null;
                -1 !== c && (h = s.slice(0, c), l = s.slice(c + 1));
                var u = t[h];
                if (null != u) if (l || !o(u) && !i(u)) {
                  if (r(u)) for (var f = 0, v = u.length; f < v; f += 1) e(u[f], l);else l && e(u, l);
                } else a.push(n(u));
              } else a.push(t);
            }(e, t), a;
          },
          isArray: r,
          isString: o,
          isNum: i,
          toString: n
        };
      }]);
    });
    });

    var Fuse = /*@__PURE__*/getDefaultExportFromCjs(fuse);

    async function formatForAssembly(html, section, data) {
      html = html.toString();

      for (let datum of data) {
        let r = new RegExp("\\$\\{" + datum.key + "\\}", "g"); //Loop again if datum.value is the accoms list

        if (Array.isArray(datum.value)) {
          let replacer = "<div class='listed-accommodations'>";

          for (let val of datum.value) {
            let styleAdd = "";
            if (replacer) styleAdd = "margin-top: .5em; ";
            replacer += "<div style='" + styleAdd + "'><strong>" + val.name + "</strong><div>" + val.content + "</div></div>";
          }

          replacer += "</div>";
          html = html.replace(r, replacer);
        } else html = html.replace(r, datum.value);
      }

      html = "<div class=\"" + section + "\">" + html + "</div>"; // let height = 0

      if (section != 'body') {
        // html += "<style>." + section + " { transform: scale(.77) translateX(-7%); font-size: 1em; padding: 20px 0; width: 200%; margin: 0 auto; }</style>"
        // //Add a DOM node to test the height of a header or footer
        // let heightBlock = document.createElement('div')
        // heightBlock.innerHTML = html
        // heightBlock.style.width = "612pt"
        // document.body.appendChild(heightBlock)
        // height = heightBlock.offsetHeight + 10
        // heightBlock.remove()
        console.log("Not sure how we got here...");
      } else {
        //Add a DOM node to copy font settings to the inner div
        let block = document.createElement('div');
        block.innerHTML = html;
        document.body.appendChild(block);
        let accomBlocks = block.querySelectorAll('.listed-accommodations');

        if (accomBlocks && accomBlocks.length) {
          for (let blk of accomBlocks) {
            let p = blk.previousSibling;
            let span = p.children[0];
            let style = span ? span.getAttribute('style') : "";
            blk.style = style;
            p.remove();
          }

          html = block.innerHTML;
          block.remove();
        }
      }

      return html; // return {
      //     height,
      //     html
      // }
    }

    async function printPDF(header, body, footer, data, print = true) {
      // let formattedHeader = await formatForAssembly(header, 'header', data)
      let formattedBody = await formatForAssembly(body, 'body', data);
      let htmlOut = "<!doctype html><html><head><title>Accommodate</title><meta charset='utf-8'></head><body>" + formattedBody;
      if (print) htmlOut += "<script>window.print(); window.onafterprint=function(){ window.close(); }</script>";
      htmlOut += "</body>";
      return htmlOut; // let formattedFooter = await formatForAssembly(footer, 'footer', data)
      // const browser = await puppeteer.launch({headless: true})
      // const page = await browser.newPage()
      // await page.goto('data:text/html,' + formattedBody.html, { waitUntil: 'networkidle0' })
      // const pdf = await page.pdf({ 
      //     displayHeaderFooter: true,
      //     format: "A4",
      //     headerTemplate: " ",
      //     footerTemplate: " ",
      //     // margin: {
      //     //     top: formattedHeader.height > 40 ? (formattedHeader.height) + 'px': "40px",
      //     //     bottom: formattedFooter.height > 40 ? (formattedFooter.height) + 'px': "40px",
      //     //     left: "40px",
      //     //     right: "40px",
      //     // }
      //     margin: {
      //         top: "40px",
      //         bottom: "40px",
      //         left: "40px",
      //         right: "40px"
      //     }
      // })
      // await browser.close()
      // return pdf
    }

    /* src\Students.svelte generated by Svelte v3.38.3 */

    function get_each_context$6(ctx, list, i) {
      const child_ctx = ctx.slice();
      child_ctx[41] = list[i];
      return child_ctx;
    } // (1:0) <script>      import { fly }


    function create_catch_block(ctx) {
      return {
        c: noop,
        m: noop,
        p: noop,
        i: noop,
        o: noop,
        d: noop
      };
    } // (155:0) {:then}


    function create_then_block(ctx) {
      let div8;
      let div0;
      let h2;
      let t0_value = formatText(
      /*$settings*/
      ctx[9].students, true, true) + "";
      let t0;
      let t1;
      let div1;
      let label;
      let t3;
      let input;
      let t4;
      let div2;
      let t6;
      let div3;
      let a0;
      let t7;
      let t8_value = formatText(
      /*$settings*/
      ctx[9].students, false, false) + "";
      let t8;
      let t9;
      let div7;
      let div4;
      let a1;
      let t11;
      let a2;
      let t13;
      let div5;
      let t14;
      let t15_value = resultsPerPage *
      /*page*/
      ctx[5] + 1 + "";
      let t15;
      let t16;
      let t17_value = (resultsPerPage *
      /*page*/
      ctx[5] + resultsPerPage <
      /*studentCount*/
      ctx[6] ?
      /*studentCount*/
      ctx[6] *
      /*page*/
      ctx[5] + resultsPerPage :
      /*studentCount*/
      ctx[6]) + "";
      let t17;
      let t18;
      let div6;
      let a3;
      let t20;
      let a4;
      let t22;
      let div8_intro;
      let div8_outro;
      let current;
      let mounted;
      let dispose;

      function select_block_type(ctx, dirty) {
        if (
        /*searchResults*/
        ctx[0].length) return create_if_block_3$1;
        return create_else_block$1;
      }

      let current_block_type = select_block_type(ctx);
      let if_block = current_block_type(ctx);
      return {
        c() {
          div8 = element("div");
          div0 = element("div");
          h2 = element("h2");
          t0 = text(t0_value);
          t1 = space();
          div1 = element("div");
          label = element("label");
          label.textContent = "Find:";
          t3 = space();
          input = element("input");
          t4 = space();
          div2 = element("div");
          div2.textContent = "Search by name or ID.";
          t6 = space();
          div3 = element("div");
          a0 = element("a");
          t7 = text("New ");
          t8 = text(t8_value);
          t9 = space();
          div7 = element("div");
          div4 = element("div");
          a1 = element("a");
          a1.textContent = "«";
          t11 = space();
          a2 = element("a");
          a2.textContent = "‹";
          t13 = space();
          div5 = element("div");
          t14 = text("Results ");
          t15 = text(t15_value);
          t16 = text(" - ");
          t17 = text(t17_value);
          t18 = space();
          div6 = element("div");
          a3 = element("a");
          a3.textContent = "›";
          t20 = space();
          a4 = element("a");
          a4.textContent = "»";
          t22 = space();
          if_block.c();
          attr(div0, "class", "switchable");
          attr(label, "for", "search");
          attr(input, "type", "text");
          attr(input, "id", "search");
          attr(div1, "class", "form-halves");
          attr(a0, "href", "newStud");
          attr(div3, "class", "mt-2 mb-1");
          attr(a1, "href", "firstpage");
          attr(a1, "class", "svelte-cvv0f4");
          attr(a2, "href", "prevpage");
          attr(a2, "class", "svelte-cvv0f4");
          attr(div4, "class", "controls svelte-cvv0f4");
          attr(a3, "href", "nextpage");
          attr(a3, "class", "svelte-cvv0f4");
          attr(a4, "href", "lastpage");
          attr(a4, "class", "svelte-cvv0f4");
          attr(div6, "class", "controls svelte-cvv0f4");
          attr(div7, "class", "pagination svelte-cvv0f4");
          set_style(div8, "position", "relative");
        },

        m(target, anchor) {
          insert(target, div8, anchor);
          append(div8, div0);
          append(div0, h2);
          append(h2, t0);
          append(div8, t1);
          append(div8, div1);
          append(div1, label);
          append(div1, t3);
          append(div1, input);
          /*input_binding*/

          ctx[15](input);
          append(div8, t4);
          append(div8, div2);
          append(div8, t6);
          append(div8, div3);
          append(div3, a0);
          append(a0, t7);
          append(a0, t8);
          append(div8, t9);
          append(div8, div7);
          append(div7, div4);
          append(div4, a1);
          append(div4, t11);
          append(div4, a2);
          append(div7, t13);
          append(div7, div5);
          append(div5, t14);
          append(div5, t15);
          append(div5, t16);
          append(div5, t17);
          append(div7, t18);
          append(div7, div6);
          append(div6, a3);
          append(div6, t20);
          append(div6, a4);
          append(div8, t22);
          if_block.m(div8, null);
          current = true;

          if (!mounted) {
            dispose = [listen(input, "keyup",
            /*keyup_handler*/
            ctx[16]), listen(a0, "click", prevent_default(
            /*click_handler*/
            ctx[17])), listen(a1, "click", prevent_default(
            /*click_handler_1*/
            ctx[18])), listen(a2, "click", prevent_default(
            /*click_handler_2*/
            ctx[19])), listen(a3, "click", prevent_default(
            /*click_handler_3*/
            ctx[20])), listen(a4, "click", prevent_default(
            /*click_handler_4*/
            ctx[21]))];
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if ((!current || dirty[0] &
          /*$settings*/
          512) && t0_value !== (t0_value = formatText(
          /*$settings*/
          ctx[9].students, true, true) + "")) set_data(t0, t0_value);
          if ((!current || dirty[0] &
          /*$settings*/
          512) && t8_value !== (t8_value = formatText(
          /*$settings*/
          ctx[9].students, false, false) + "")) set_data(t8, t8_value);
          if ((!current || dirty[0] &
          /*page*/
          32) && t15_value !== (t15_value = resultsPerPage *
          /*page*/
          ctx[5] + 1 + "")) set_data(t15, t15_value);
          if ((!current || dirty[0] &
          /*page, studentCount*/
          96) && t17_value !== (t17_value = (resultsPerPage *
          /*page*/
          ctx[5] + resultsPerPage <
          /*studentCount*/
          ctx[6] ?
          /*studentCount*/
          ctx[6] *
          /*page*/
          ctx[5] + resultsPerPage :
          /*studentCount*/
          ctx[6]) + "")) set_data(t17, t17_value);

          if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
            if_block.p(ctx, dirty);
          } else {
            if_block.d(1);
            if_block = current_block_type(ctx);

            if (if_block) {
              if_block.c();
              if_block.m(div8, null);
            }
          }
        },

        i(local) {
          if (current) return;
          add_render_callback(() => {
            if (div8_outro) div8_outro.end(1);
            if (!div8_intro) div8_intro = create_in_transition(div8, fly, {
              x: 100,
              delay: 500
            });
            div8_intro.start();
          });
          current = true;
        },

        o(local) {
          if (div8_intro) div8_intro.invalidate();
          div8_outro = create_out_transition(div8, fly, {
            x: 100
          });
          current = false;
        },

        d(detaching) {
          if (detaching) detach(div8);
          /*input_binding*/

          ctx[15](null);
          if_block.d();
          if (detaching && div8_outro) div8_outro.end();
          mounted = false;
          run_all(dispose);
        }

      };
    } // (196:8) {:else}


    function create_else_block$1(ctx) {
      let p;
      let t0;
      let t1_value = formatText(
      /*$settings*/
      ctx[9].students, true, false) + "";
      let t1;
      let t2;
      return {
        c() {
          p = element("p");
          t0 = text("No ");
          t1 = text(t1_value);
          t2 = text(" found. :-(");
        },

        m(target, anchor) {
          insert(target, p, anchor);
          append(p, t0);
          append(p, t1);
          append(p, t2);
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*$settings*/
          512 && t1_value !== (t1_value = formatText(
          /*$settings*/
          ctx[9].students, true, false) + "")) set_data(t1, t1_value);
        },

        d(detaching) {
          if (detaching) detach(p);
        }

      };
    } // (181:8) {#if searchResults.length}


    function create_if_block_3$1(ctx) {
      let each_1_anchor;
      let each_value =
      /*searchResults*/
      ctx[0];
      let each_blocks = [];

      for (let i = 0; i < each_value.length; i += 1) {
        each_blocks[i] = create_each_block$6(get_each_context$6(ctx, each_value, i));
      }

      return {
        c() {
          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].c();
          }

          each_1_anchor = empty();
        },

        m(target, anchor) {
          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].m(target, anchor);
          }

          insert(target, each_1_anchor, anchor);
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*newStud, searchResults, studCreatorOpen, removeStud, printDoc*/
          20611) {
            each_value =
            /*searchResults*/
            ctx[0];
            let i;

            for (i = 0; i < each_value.length; i += 1) {
              const child_ctx = get_each_context$6(ctx, each_value, i);

              if (each_blocks[i]) {
                each_blocks[i].p(child_ctx, dirty);
              } else {
                each_blocks[i] = create_each_block$6(child_ctx);
                each_blocks[i].c();
                each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
              }
            }

            for (; i < each_blocks.length; i += 1) {
              each_blocks[i].d(1);
            }

            each_blocks.length = each_value.length;
          }
        },

        d(detaching) {
          destroy_each(each_blocks, detaching);
          if (detaching) detach(each_1_anchor);
        }

      };
    } // (187:24) {#if loa.accomsList && loa.accomsList.length}


    function create_if_block_4$1(ctx) {
      let a0;
      let t1;
      let a1;
      let t2;
      let a1_href_value;
      let mounted;
      let dispose;

      function click_handler_5() {
        return (
          /*click_handler_5*/
          ctx[22](
          /*loa*/
          ctx[41])
        );
      }

      return {
        c() {
          a0 = element("a");
          a0.textContent = "Print current";
          t1 = space();
          a1 = element("a");
          t2 = text("See record");
          attr(a0, "href", "print");
          attr(a0, "class", "svelte-cvv0f4");
          attr(a1, "href", a1_href_value = "#record/" +
          /*loa*/
          ctx[41].student._id);
          attr(a1, "class", "svelte-cvv0f4");
        },

        m(target, anchor) {
          insert(target, a0, anchor);
          insert(target, t1, anchor);
          insert(target, a1, anchor);
          append(a1, t2);

          if (!mounted) {
            dispose = listen(a0, "click", prevent_default(click_handler_5));
            mounted = true;
          }
        },

        p(new_ctx, dirty) {
          ctx = new_ctx;

          if (dirty[0] &
          /*searchResults*/
          1 && a1_href_value !== (a1_href_value = "#record/" +
          /*loa*/
          ctx[41].student._id)) {
            attr(a1, "href", a1_href_value);
          }
        },

        d(detaching) {
          if (detaching) detach(a0);
          if (detaching) detach(t1);
          if (detaching) detach(a1);
          mounted = false;
          dispose();
        }

      };
    } // (182:12) {#each searchResults as loa}


    function create_each_block$6(ctx) {
      let div3;
      let h4;
      let t0_value =
      /*loa*/
      ctx[41].student.lname + ", " +
      /*loa*/
      ctx[41].student.fname + " (" +
      /*loa*/
      ctx[41].student._id + ")" + "";
      let t0;
      let t1;
      let p;
      let t2_value = abbreviate("Current accommodations: " + (
      /*loa*/
      ctx[41].accomsList &&
      /*loa*/
      ctx[41].accomsList.length ?
      /*loa*/
      ctx[41].accomsList.join(", ") : "none listed"), 200) + "";
      let t2;
      let t3;
      let div0;
      let t4;
      let div1;
      let t6;
      let div2;
      let t8;
      let mounted;
      let dispose;
      let if_block =
      /*loa*/
      ctx[41].accomsList &&
      /*loa*/
      ctx[41].accomsList.length && create_if_block_4$1(ctx);

      function click_handler_6() {
        return (
          /*click_handler_6*/
          ctx[23](
          /*loa*/
          ctx[41])
        );
      }

      function click_handler_7() {
        return (
          /*click_handler_7*/
          ctx[24](
          /*loa*/
          ctx[41])
        );
      }

      return {
        c() {
          div3 = element("div");
          h4 = element("h4");
          t0 = text(t0_value);
          t1 = space();
          p = element("p");
          t2 = text(t2_value);
          t3 = space();
          div0 = element("div");
          if (if_block) if_block.c();
          t4 = space();
          div1 = element("div");
          div1.textContent = "×";
          t6 = space();
          div2 = element("div");
          div2.textContent = "✎";
          t8 = space();
          attr(div0, "class", "bottom-links svelte-cvv0f4");
          attr(div1, "class", "close");
          attr(div2, "class", "close edit");
          attr(div3, "class", "student whitebox");
        },

        m(target, anchor) {
          insert(target, div3, anchor);
          append(div3, h4);
          append(h4, t0);
          append(div3, t1);
          append(div3, p);
          append(p, t2);
          append(div3, t3);
          append(div3, div0);
          if (if_block) if_block.m(div0, null);
          append(div3, t4);
          append(div3, div1);
          append(div3, t6);
          append(div3, div2);
          append(div3, t8);

          if (!mounted) {
            dispose = [listen(div1, "click", click_handler_6), listen(div2, "click", click_handler_7)];
            mounted = true;
          }
        },

        p(new_ctx, dirty) {
          ctx = new_ctx;
          if (dirty[0] &
          /*searchResults*/
          1 && t0_value !== (t0_value =
          /*loa*/
          ctx[41].student.lname + ", " +
          /*loa*/
          ctx[41].student.fname + " (" +
          /*loa*/
          ctx[41].student._id + ")" + "")) set_data(t0, t0_value);
          if (dirty[0] &
          /*searchResults*/
          1 && t2_value !== (t2_value = abbreviate("Current accommodations: " + (
          /*loa*/
          ctx[41].accomsList &&
          /*loa*/
          ctx[41].accomsList.length ?
          /*loa*/
          ctx[41].accomsList.join(", ") : "none listed"), 200) + "")) set_data(t2, t2_value);

          if (
          /*loa*/
          ctx[41].accomsList &&
          /*loa*/
          ctx[41].accomsList.length) {
            if (if_block) {
              if_block.p(ctx, dirty);
            } else {
              if_block = create_if_block_4$1(ctx);
              if_block.c();
              if_block.m(div0, null);
            }
          } else if (if_block) {
            if_block.d(1);
            if_block = null;
          }
        },

        d(detaching) {
          if (detaching) detach(div3);
          if (if_block) if_block.d();
          mounted = false;
          run_all(dispose);
        }

      };
    } // (153:26)       <div class='loading'>Loading...</div>  {:then}


    function create_pending_block(ctx) {
      let div;
      return {
        c() {
          div = element("div");
          div.textContent = "Loading...";
          attr(div, "class", "loading");
        },

        m(target, anchor) {
          insert(target, div, anchor);
        },

        p: noop,
        i: noop,
        o: noop,

        d(detaching) {
          if (detaching) detach(div);
        }

      };
    } // (202:0) {#if studCreatorOpen}


    function create_if_block_2$1(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_2$1]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler*/
      ctx[29]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*studCreatorOpen, newStud, $settings*/
          642 | dirty[1] &
          /*$$scope*/
          8192) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (203:4) <Modal on:forceClose={()=>{ studCreatorOpen = false; newStud = {          student: { fname: "", lname: "", _id: "" }, studentNotes:"",              dateUpdated:null,              dateIssued:null,              accoms:[]} }          }>


    function create_default_slot_2$1(ctx) {
      let h3;
      let t0_value = formatText(
      /*$settings*/
      ctx[9].students, false, true) + "";
      let t0;
      let t1;
      let t2;
      let form;
      let div0;
      let label0;
      let t4;
      let input0;
      let t5;
      let div1;
      let label1;
      let t7;
      let input1;
      let t8;
      let div2;
      let label2;
      let t9_value = formatText(
      /*$settings*/
      ctx[9].students, false, true) + "";
      let t9;
      let t10;
      let t11;
      let input2;
      let t12;
      let button;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          t0 = text(t0_value);
          t1 = text(" Details");
          t2 = space();
          form = element("form");
          div0 = element("div");
          label0 = element("label");
          label0.textContent = "First name";
          t4 = space();
          input0 = element("input");
          t5 = space();
          div1 = element("div");
          label1 = element("label");
          label1.textContent = "Last name";
          t7 = space();
          input1 = element("input");
          t8 = space();
          div2 = element("div");
          label2 = element("label");
          t9 = text(t9_value);
          t10 = text(" ID");
          t11 = space();
          input2 = element("input");
          t12 = space();
          button = element("button");
          button.textContent = "OK";
          attr(label0, "for", "fname");
          attr(input0, "type", "text");
          attr(input0, "id", "fname");
          attr(div0, "class", "form-halves");
          attr(label1, "for", "fname");
          attr(input1, "type", "text");
          attr(input1, "id", "fname");
          attr(div1, "class", "form-halves");
          attr(label2, "for", "id");
          attr(input2, "type", "text");
          attr(input2, "id", "id");
          attr(div2, "class", "form-halves");
          attr(button, "class", "centered blue");
          attr(button, "type", "submit");
          attr(form, "id", "new-stud-form");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          append(h3, t0);
          append(h3, t1);
          insert(target, t2, anchor);
          insert(target, form, anchor);
          append(form, div0);
          append(div0, label0);
          append(div0, t4);
          append(div0, input0);
          set_input_value(input0,
          /*newStud*/
          ctx[7].student.fname);
          append(form, t5);
          append(form, div1);
          append(div1, label1);
          append(div1, t7);
          append(div1, input1);
          set_input_value(input1,
          /*newStud*/
          ctx[7].student.lname);
          append(form, t8);
          append(form, div2);
          append(div2, label2);
          append(label2, t9);
          append(label2, t10);
          append(div2, t11);
          append(div2, input2);
          set_input_value(input2,
          /*newStud*/
          ctx[7].student._id);
          append(form, t12);
          append(form, button);

          if (!mounted) {
            dispose = [listen(input0, "input",
            /*input0_input_handler*/
            ctx[25]), listen(input1, "input",
            /*input1_input_handler*/
            ctx[26]), listen(input2, "input",
            /*input2_input_handler*/
            ctx[27]), listen(button, "click", prevent_default(
            /*click_handler_8*/
            ctx[28]))];
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*$settings*/
          512 && t0_value !== (t0_value = formatText(
          /*$settings*/
          ctx[9].students, false, true) + "")) set_data(t0, t0_value);

          if (dirty[0] &
          /*newStud*/
          128 && input0.value !==
          /*newStud*/
          ctx[7].student.fname) {
            set_input_value(input0,
            /*newStud*/
            ctx[7].student.fname);
          }

          if (dirty[0] &
          /*newStud*/
          128 && input1.value !==
          /*newStud*/
          ctx[7].student.lname) {
            set_input_value(input1,
            /*newStud*/
            ctx[7].student.lname);
          }

          if (dirty[0] &
          /*$settings*/
          512 && t9_value !== (t9_value = formatText(
          /*$settings*/
          ctx[9].students, false, true) + "")) set_data(t9, t9_value);

          if (dirty[0] &
          /*newStud*/
          128 && input2.value !==
          /*newStud*/
          ctx[7].student._id) {
            set_input_value(input2,
            /*newStud*/
            ctx[7].student._id);
          }
        },

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t2);
          if (detaching) detach(form);
          mounted = false;
          run_all(dispose);
        }

      };
    } // (229:0) {#if showConfirmModal}


    function create_if_block_1$1(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_1$1]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_1*/
      ctx[32]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*showConfirmModal, toDelete, $settings*/
          772 | dirty[1] &
          /*$$scope*/
          8192) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (230:4) <Modal on:forceClose={()=>{ showConfirmModal = false; toDelete = "" }}>


    function create_default_slot_1$1(ctx) {
      let h3;
      let t1;
      let p;
      let t2;
      let t3_value = formatText(
      /*$settings*/
      ctx[9].students, false, false) + "";
      let t3;
      let t4;
      let t5_value = formatText(
      /*$settings*/
      ctx[9].students, false, false) + "";
      let t5;
      let t6;
      let t7_value = formatText(
      /*$settings*/
      ctx[9].services, false, false) + "";
      let t7;
      let t8;
      let t9;
      let div;
      let button0;
      let t11;
      let button1;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          h3.textContent = "Are you sure?";
          t1 = space();
          p = element("p");
          t2 = text("If you delete this ");
          t3 = text(t3_value);
          t4 = text(", it will not be recoverable. This will not affect ");
          t5 = text(t5_value);
          t6 = text("'s committed ");
          t7 = text(t7_value);
          t8 = text(" history.");
          t9 = space();
          div = element("div");
          button0 = element("button");
          button0.textContent = "Delete it";
          t11 = space();
          button1 = element("button");
          button1.textContent = "Never mind";
          attr(button0, "class", "centered");
          attr(button0, "type", "submit");
          attr(button1, "class", "centered blue");
          attr(button1, "type", "submit");
          attr(div, "class", "align-ends");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          insert(target, t1, anchor);
          insert(target, p, anchor);
          append(p, t2);
          append(p, t3);
          append(p, t4);
          append(p, t5);
          append(p, t6);
          append(p, t7);
          append(p, t8);
          insert(target, t9, anchor);
          insert(target, div, anchor);
          append(div, button0);
          append(div, t11);
          append(div, button1);

          if (!mounted) {
            dispose = [listen(button0, "click", prevent_default(
            /*click_handler_9*/
            ctx[30])), listen(button1, "click", prevent_default(
            /*click_handler_10*/
            ctx[31]))];
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*$settings*/
          512 && t3_value !== (t3_value = formatText(
          /*$settings*/
          ctx[9].students, false, false) + "")) set_data(t3, t3_value);
          if (dirty[0] &
          /*$settings*/
          512 && t5_value !== (t5_value = formatText(
          /*$settings*/
          ctx[9].students, false, false) + "")) set_data(t5, t5_value);
          if (dirty[0] &
          /*$settings*/
          512 && t7_value !== (t7_value = formatText(
          /*$settings*/
          ctx[9].services, false, false) + "")) set_data(t7, t7_value);
        },

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t1);
          if (detaching) detach(p);
          if (detaching) detach(t9);
          if (detaching) detach(div);
          mounted = false;
          run_all(dispose);
        }

      };
    } // (240:0) {#if showDeleteConfirmModal}


    function create_if_block$3(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot$1]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_2*/
      ctx[34]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*showDeleteConfirmModal*/
          8 | dirty[1] &
          /*$$scope*/
          8192) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (241:4) <Modal on:forceClose={()=>{ showDeleteConfirmModal = false }}>


    function create_default_slot$1(ctx) {
      let h3;
      let t1;
      let p;
      let t3;
      let button;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          h3.textContent = "All done!";
          t1 = space();
          p = element("p");
          p.textContent = "The indicated student has been removed from the list.";
          t3 = space();
          button = element("button");
          button.textContent = "OK";
          attr(button, "class", "centered blue");
          attr(button, "type", "submit");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          insert(target, t1, anchor);
          insert(target, p, anchor);
          insert(target, t3, anchor);
          insert(target, button, anchor);

          if (!mounted) {
            dispose = listen(button, "click", prevent_default(
            /*click_handler_11*/
            ctx[33]));
            mounted = true;
          }
        },

        p: noop,

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t1);
          if (detaching) detach(p);
          if (detaching) detach(t3);
          if (detaching) detach(button);
          mounted = false;
          dispose();
        }

      };
    }

    function create_fragment$8(ctx) {
      let promise;
      let t0;
      let t1;
      let t2;
      let if_block2_anchor;
      let current;
      let info = {
        ctx,
        current: null,
        token: null,
        hasCatch: false,
        pending: create_pending_block,
        then: create_then_block,
        catch: create_catch_block,
        blocks: [,,,]
      };
      handle_promise(promise =
      /*searchTime*/
      ctx[11]("", 0), info);
      let if_block0 =
      /*studCreatorOpen*/
      ctx[1] && create_if_block_2$1(ctx);
      let if_block1 =
      /*showConfirmModal*/
      ctx[2] && create_if_block_1$1(ctx);
      let if_block2 =
      /*showDeleteConfirmModal*/
      ctx[3] && create_if_block$3(ctx);
      return {
        c() {
          info.block.c();
          t0 = space();
          if (if_block0) if_block0.c();
          t1 = space();
          if (if_block1) if_block1.c();
          t2 = space();
          if (if_block2) if_block2.c();
          if_block2_anchor = empty();
        },

        m(target, anchor) {
          info.block.m(target, info.anchor = anchor);

          info.mount = () => t0.parentNode;

          info.anchor = t0;
          insert(target, t0, anchor);
          if (if_block0) if_block0.m(target, anchor);
          insert(target, t1, anchor);
          if (if_block1) if_block1.m(target, anchor);
          insert(target, t2, anchor);
          if (if_block2) if_block2.m(target, anchor);
          insert(target, if_block2_anchor, anchor);
          current = true;
        },

        p(new_ctx, dirty) {
          ctx = new_ctx;
          update_await_block_branch(info, ctx, dirty);

          if (
          /*studCreatorOpen*/
          ctx[1]) {
            if (if_block0) {
              if_block0.p(ctx, dirty);

              if (dirty[0] &
              /*studCreatorOpen*/
              2) {
                transition_in(if_block0, 1);
              }
            } else {
              if_block0 = create_if_block_2$1(ctx);
              if_block0.c();
              transition_in(if_block0, 1);
              if_block0.m(t1.parentNode, t1);
            }
          } else if (if_block0) {
            group_outros();
            transition_out(if_block0, 1, 1, () => {
              if_block0 = null;
            });
            check_outros();
          }

          if (
          /*showConfirmModal*/
          ctx[2]) {
            if (if_block1) {
              if_block1.p(ctx, dirty);

              if (dirty[0] &
              /*showConfirmModal*/
              4) {
                transition_in(if_block1, 1);
              }
            } else {
              if_block1 = create_if_block_1$1(ctx);
              if_block1.c();
              transition_in(if_block1, 1);
              if_block1.m(t2.parentNode, t2);
            }
          } else if (if_block1) {
            group_outros();
            transition_out(if_block1, 1, 1, () => {
              if_block1 = null;
            });
            check_outros();
          }

          if (
          /*showDeleteConfirmModal*/
          ctx[3]) {
            if (if_block2) {
              if_block2.p(ctx, dirty);

              if (dirty[0] &
              /*showDeleteConfirmModal*/
              8) {
                transition_in(if_block2, 1);
              }
            } else {
              if_block2 = create_if_block$3(ctx);
              if_block2.c();
              transition_in(if_block2, 1);
              if_block2.m(if_block2_anchor.parentNode, if_block2_anchor);
            }
          } else if (if_block2) {
            group_outros();
            transition_out(if_block2, 1, 1, () => {
              if_block2 = null;
            });
            check_outros();
          }
        },

        i(local) {
          if (current) return;
          transition_in(info.block);
          transition_in(if_block0);
          transition_in(if_block1);
          transition_in(if_block2);
          current = true;
        },

        o(local) {
          for (let i = 0; i < 3; i += 1) {
            const block = info.blocks[i];
            transition_out(block);
          }

          transition_out(if_block0);
          transition_out(if_block1);
          transition_out(if_block2);
          current = false;
        },

        d(detaching) {
          info.block.d(detaching);
          info.token = null;
          info = null;
          if (detaching) detach(t0);
          if (if_block0) if_block0.d(detaching);
          if (detaching) detach(t1);
          if (if_block1) if_block1.d(detaching);
          if (detaching) detach(t2);
          if (if_block2) if_block2.d(detaching);
          if (detaching) detach(if_block2_anchor);
        }

      };
    }

    let resultsPerPage = 10;

    function instance$8($$self, $$props, $$invalidate) {
      let $settings;
      component_subscribe($$self, settings, $$value => $$invalidate(9, $settings = $$value));

      const {
        shell
      } = require("electron");

      const fs = require("fs");

      let studs = [];
      let searchResults = [];
      let studCreatorOpen = false;
      let showConfirmModal = false;
      let showDeleteConfirmModal = false;
      let searchTimeout = null;
      let searchBox = null;
      let page = 0;
      let studentCount = 0;
      let newStud = {
        student: {
          fname: "",
          lname: "",
          _id: ""
        },
        studentNotes: "",
        dateUpdated: null,
        dateIssued: null,
        accoms: []
      };
      let toDelete = "";
      let fuse = null;

      let save = () => {
        saveStudent(newStud, $settings.databasedir).then(() => {
          searchTime(searchBox.value, 0);
        });
      };

      let searchTime = (search, timeout = 600) => {
        return new Promise(resolve => {
          if (searchTimeout) clearTimeout(searchTimeout);
          searchTimeout = setTimeout(() => {
            loadStudents(resultsPerPage * page, resultsPerPage, search, $settings.databasedir).then(studsLoaded => {
              countStudents($settings.databasedir).then(count => {
                $$invalidate(6, studentCount = count);
              });
              studs = studsLoaded;
              $$invalidate(1, studCreatorOpen = false);
              $$invalidate(7, newStud = {
                student: {
                  fname: "",
                  lname: "",
                  _id: ""
                },
                studentNotes: "",
                dateUpdated: null,
                dateIssued: null,
                accoms: []
              });
              fuse = new Fuse(studs, {
                keys: ["student.fname", "student.lname", "student._id"]
              });
              if (search == "") $$invalidate(0, searchResults = studs);else $$invalidate(0, searchResults = fuse.search(search));
              resolve(true);
            });
          }, timeout);
        });
      };

      let removeStud = id => {
        $$invalidate(8, toDelete = id);
        $$invalidate(2, showConfirmModal = true);
      };

      let deleteConfirm = id => {
        removeStudent(id, $settings.databasedir).then(() => {
          $$invalidate(8, toDelete = "");
          $$invalidate(3, showDeleteConfirmModal = true);
          $$invalidate(2, showConfirmModal = false);
          searchTime(searchBox.value, 0);
        });
      };

      let bodyData;

      function printDoc(data) {
        let formattedData = [{
          key: "first name",
          value: data.student.fname
        }, {
          key: "last name",
          value: data.student.lname
        }, {
          key: "id",
          value: data.student._id
        }, {
          key: "date",
          value: new Date(data.dateUpdated).getMonth() + 1 + "/" + new Date(data.dateUpdated).getDate() + "/" + new Date(data.dateUpdated).getFullYear()
        }, {
          key: formatText($settings.services, true, false),
          value: data.accoms || "None listed"
        }, {
          key: formatText($settings.students, false, false) + " notes",
          value: data.studentNotes || "None provided"
        }];
        printPDF(" ", bodyData, " ", formattedData).then(html => {
          fs.writeFileSync($settings.systemdir + "/target.html", html);
          shell.openItem($settings.systemdir + "/target.html");
        }).catch(e => {
          alert(e);
          previewModalOpen = false;
          docErrorModalOpen = true;
        });
        currentRecord = {};
      }

      onMount(() => {
        bodyData = fs.existsSync($settings.systemdir + "/body.accom") ? fs.readFileSync($settings.systemdir + "/body.accom") : "";
      });

      function input_binding($$value) {
        binding_callbacks[$$value ? "unshift" : "push"](() => {
          searchBox = $$value;
          $$invalidate(4, searchBox);
        });
      }

      const keyup_handler = () => {
        searchTime(searchBox.value);
      };

      const click_handler = () => {
        $$invalidate(1, studCreatorOpen = true);
      };

      const click_handler_1 = () => {
        $$invalidate(5, page = 0);
        searchTime(searchBox.value, 0);
      };

      const click_handler_2 = () => {
        page > 0 ? $$invalidate(5, page -= 1) : $$invalidate(5, page = 0);
        searchTime(searchBox.value, 0);
      };

      const click_handler_3 = () => {
        page < Math.floor(studentCount / resultsPerPage) ? $$invalidate(5, page += 1) : $$invalidate(5, page = Math.floor(studentCount / resultsPerPage));
        searchTime(searchBox.value, 0);
      };

      const click_handler_4 = () => {
        $$invalidate(5, page = Math.floor(studentCount / resultsPerPage));
        searchTime(searchBox.value, 0);
      };

      const click_handler_5 = loa => printDoc(loa);

      const click_handler_6 = loa => {
        removeStud(loa.student._id);
      };

      const click_handler_7 = loa => {
        $$invalidate(7, newStud = loa);
        $$invalidate(1, studCreatorOpen = true);
      };

      function input0_input_handler() {
        newStud.student.fname = this.value;
        $$invalidate(7, newStud);
      }

      function input1_input_handler() {
        newStud.student.lname = this.value;
        $$invalidate(7, newStud);
      }

      function input2_input_handler() {
        newStud.student._id = this.value;
        $$invalidate(7, newStud);
      }

      const click_handler_8 = () => {
        save();
        $$invalidate(1, studCreatorOpen = false);
      };

      const forceClose_handler = () => {
        $$invalidate(1, studCreatorOpen = false);
        $$invalidate(7, newStud = {
          student: {
            fname: "",
            lname: "",
            _id: ""
          },
          studentNotes: "",
          dateUpdated: null,
          dateIssued: null,
          accoms: []
        });
      };

      const click_handler_9 = () => {
        deleteConfirm(toDelete);
      };

      const click_handler_10 = () => {
        $$invalidate(2, showConfirmModal = false);
        $$invalidate(8, toDelete = "");
      };

      const forceClose_handler_1 = () => {
        $$invalidate(2, showConfirmModal = false);
        $$invalidate(8, toDelete = "");
      };

      const click_handler_11 = () => {
        $$invalidate(3, showDeleteConfirmModal = false);
      };

      const forceClose_handler_2 = () => {
        $$invalidate(3, showDeleteConfirmModal = false);
      };

      return [searchResults, studCreatorOpen, showConfirmModal, showDeleteConfirmModal, searchBox, page, studentCount, newStud, toDelete, $settings, save, searchTime, removeStud, deleteConfirm, printDoc, input_binding, keyup_handler, click_handler, click_handler_1, click_handler_2, click_handler_3, click_handler_4, click_handler_5, click_handler_6, click_handler_7, input0_input_handler, input1_input_handler, input2_input_handler, click_handler_8, forceClose_handler, click_handler_9, click_handler_10, forceClose_handler_1, click_handler_11, forceClose_handler_2];
    }

    class Students extends SvelteComponent {
      constructor(options) {
        super();
        init(this, options, instance$8, create_fragment$8, safe_not_equal, {}, [-1, -1]);
      }

    }

    /* src\Accommodations.svelte generated by Svelte v3.38.3 */

    function get_each_context$7(ctx, list, i) {
      const child_ctx = ctx.slice();
      child_ctx[32] = list[i];
      return child_ctx;
    } // (137:4) {:else}


    function create_else_block$2(ctx) {
      let p;
      let t0;
      let t1_value = formatText(
      /*$settings*/
      ctx[8].services, true, false) + "";
      let t1;
      let t2;
      return {
        c() {
          p = element("p");
          t0 = text("No ");
          t1 = text(t1_value);
          t2 = text(" found. :-(");
        },

        m(target, anchor) {
          insert(target, p, anchor);
          append(p, t0);
          append(p, t1);
          append(p, t2);
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*$settings*/
          256 && t1_value !== (t1_value = formatText(
          /*$settings*/
          ctx[8].services, true, false) + "")) set_data(t1, t1_value);
        },

        d(detaching) {
          if (detaching) detach(p);
        }

      };
    } // (128:4) {#if searchResults.length}


    function create_if_block_4$2(ctx) {
      let each_1_anchor;
      let each_value =
      /*searchResults*/
      ctx[0];
      let each_blocks = [];

      for (let i = 0; i < each_value.length; i += 1) {
        each_blocks[i] = create_each_block$7(get_each_context$7(ctx, each_value, i));
      }

      return {
        c() {
          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].c();
          }

          each_1_anchor = empty();
        },

        m(target, anchor) {
          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].m(target, anchor);
          }

          insert(target, each_1_anchor, anchor);
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*newAccom, searchResults, accomCreatorOpen, removeAccom*/
          2115) {
            each_value =
            /*searchResults*/
            ctx[0];
            let i;

            for (i = 0; i < each_value.length; i += 1) {
              const child_ctx = get_each_context$7(ctx, each_value, i);

              if (each_blocks[i]) {
                each_blocks[i].p(child_ctx, dirty);
              } else {
                each_blocks[i] = create_each_block$7(child_ctx);
                each_blocks[i].c();
                each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
              }
            }

            for (; i < each_blocks.length; i += 1) {
              each_blocks[i].d(1);
            }

            each_blocks.length = each_value.length;
          }
        },

        d(detaching) {
          destroy_each(each_blocks, detaching);
          if (detaching) detach(each_1_anchor);
        }

      };
    } // (129:8) {#each searchResults as accom}


    function create_each_block$7(ctx) {
      let div2;
      let h4;
      let t0_value =
      /*accom*/
      ctx[32].name + "";
      let t0;
      let t1;
      let p;
      let t2_value = abbreviate(
      /*accom*/
      ctx[32].content, 200) + "";
      let t2;
      let t3;
      let div0;
      let t5;
      let div1;
      let t7;
      let mounted;
      let dispose;

      function click_handler_1() {
        return (
          /*click_handler_1*/
          ctx[16](
          /*accom*/
          ctx[32])
        );
      }

      function click_handler_2() {
        return (
          /*click_handler_2*/
          ctx[17](
          /*accom*/
          ctx[32])
        );
      }

      return {
        c() {
          div2 = element("div");
          h4 = element("h4");
          t0 = text(t0_value);
          t1 = space();
          p = element("p");
          t2 = text(t2_value);
          t3 = space();
          div0 = element("div");
          div0.textContent = "×";
          t5 = space();
          div1 = element("div");
          div1.textContent = "✎";
          t7 = space();
          attr(div0, "class", "close");
          attr(div1, "class", "close edit");
          attr(div2, "class", "accommodation whitebox");
        },

        m(target, anchor) {
          insert(target, div2, anchor);
          append(div2, h4);
          append(h4, t0);
          append(div2, t1);
          append(div2, p);
          append(p, t2);
          append(div2, t3);
          append(div2, div0);
          append(div2, t5);
          append(div2, div1);
          append(div2, t7);

          if (!mounted) {
            dispose = [listen(div0, "click", click_handler_1), listen(div1, "click", click_handler_2)];
            mounted = true;
          }
        },

        p(new_ctx, dirty) {
          ctx = new_ctx;
          if (dirty[0] &
          /*searchResults*/
          1 && t0_value !== (t0_value =
          /*accom*/
          ctx[32].name + "")) set_data(t0, t0_value);
          if (dirty[0] &
          /*searchResults*/
          1 && t2_value !== (t2_value = abbreviate(
          /*accom*/
          ctx[32].content, 200) + "")) set_data(t2, t2_value);
        },

        d(detaching) {
          if (detaching) detach(div2);
          mounted = false;
          run_all(dispose);
        }

      };
    } // (142:0) {#if accomCreatorOpen}


    function create_if_block_2$2(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_2$2]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler*/
      ctx[23]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*accomCreatorOpen, newAccom, accomContentHighlighted, $settings*/
          354 | dirty[1] &
          /*$$scope*/
          16) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (153:20) {#if accomContentHighlighted}


    function create_if_block_3$2(ctx) {
      let div;
      let t_value = (
      /*newAccom*/
      ctx[6].content.length ? 1200 -
      /*newAccom*/
      ctx[6].content.length : 1200) + "";
      let t;
      let div_transition;
      let current;
      return {
        c() {
          div = element("div");
          t = text(t_value);
          attr(div, "class", "remaining-characters");
        },

        m(target, anchor) {
          insert(target, div, anchor);
          append(div, t);
          current = true;
        },

        p(ctx, dirty) {
          if ((!current || dirty[0] &
          /*newAccom*/
          64) && t_value !== (t_value = (
          /*newAccom*/
          ctx[6].content.length ? 1200 -
          /*newAccom*/
          ctx[6].content.length : 1200) + "")) set_data(t, t_value);
        },

        i(local) {
          if (current) return;
          add_render_callback(() => {
            if (!div_transition) div_transition = create_bidirectional_transition(div, scale, {}, true);
            div_transition.run(1);
          });
          current = true;
        },

        o(local) {
          if (!div_transition) div_transition = create_bidirectional_transition(div, scale, {}, false);
          div_transition.run(0);
          current = false;
        },

        d(detaching) {
          if (detaching) detach(div);
          if (detaching && div_transition) div_transition.end();
        }

      };
    } // (143:4) <Modal on:forceClose={()=>{ accomCreatorOpen = false; newAccom = { name: "", content: "" } }}>


    function create_default_slot_2$2(ctx) {
      let h3;
      let t0_value = formatText(
      /*$settings*/
      ctx[8].services, false, true) + "";
      let t0;
      let t1;
      let t2;
      let form;
      let div0;
      let label0;
      let t4;
      let input;
      let t5;
      let div2;
      let label1;
      let br;
      let t7;
      let div1;
      let t8;
      let textarea;
      let t9;
      let button;
      let current;
      let mounted;
      let dispose;
      let if_block =
      /*accomContentHighlighted*/
      ctx[5] && create_if_block_3$2(ctx);
      return {
        c() {
          h3 = element("h3");
          t0 = text(t0_value);
          t1 = text(" Details");
          t2 = space();
          form = element("form");
          div0 = element("div");
          label0 = element("label");
          label0.textContent = "Name";
          t4 = space();
          input = element("input");
          t5 = space();
          div2 = element("div");
          label1 = element("label");
          label1.textContent = "Content";
          br = element("br");
          t7 = space();
          div1 = element("div");
          if (if_block) if_block.c();
          t8 = space();
          textarea = element("textarea");
          t9 = space();
          button = element("button");
          button.textContent = "OK";
          attr(h3, "class", "extend svelte-f3yxzt");
          attr(label0, "for", "name");
          attr(label0, "class", "svelte-f3yxzt");
          attr(input, "type", "text");
          attr(input, "id", "name");
          attr(input, "class", "svelte-f3yxzt");
          attr(div0, "class", "form-halves2 svelte-f3yxzt");
          attr(label1, "for", "content");
          attr(textarea, "type", "text");
          attr(textarea, "id", "content");
          attr(textarea, "rows", "5");
          attr(textarea, "maxlength", "1200");
          attr(textarea, "class", "svelte-f3yxzt");
          attr(div1, "class", "accom-content-wrapper svelte-f3yxzt");
          attr(div2, "class", "in svelte-f3yxzt");
          attr(button, "class", "centered blue");
          attr(button, "type", "submit");
          attr(form, "id", "new-accom-form");
          attr(form, "class", "svelte-f3yxzt");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          append(h3, t0);
          append(h3, t1);
          insert(target, t2, anchor);
          insert(target, form, anchor);
          append(form, div0);
          append(div0, label0);
          append(div0, t4);
          append(div0, input);
          set_input_value(input,
          /*newAccom*/
          ctx[6].name);
          append(form, t5);
          append(form, div2);
          append(div2, label1);
          append(div2, br);
          append(div2, t7);
          append(div2, div1);
          if (if_block) if_block.m(div1, null);
          append(div1, t8);
          append(div1, textarea);
          set_input_value(textarea,
          /*newAccom*/
          ctx[6].content);
          append(form, t9);
          append(form, button);
          current = true;

          if (!mounted) {
            dispose = [listen(input, "input",
            /*input_input_handler*/
            ctx[18]), listen(textarea, "input",
            /*textarea_input_handler*/
            ctx[19]), listen(textarea, "focus",
            /*focus_handler*/
            ctx[20]), listen(textarea, "blur",
            /*blur_handler*/
            ctx[21]), listen(button, "click", prevent_default(
            /*click_handler_3*/
            ctx[22]))];
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if ((!current || dirty[0] &
          /*$settings*/
          256) && t0_value !== (t0_value = formatText(
          /*$settings*/
          ctx[8].services, false, true) + "")) set_data(t0, t0_value);

          if (dirty[0] &
          /*newAccom*/
          64 && input.value !==
          /*newAccom*/
          ctx[6].name) {
            set_input_value(input,
            /*newAccom*/
            ctx[6].name);
          }

          if (
          /*accomContentHighlighted*/
          ctx[5]) {
            if (if_block) {
              if_block.p(ctx, dirty);

              if (dirty[0] &
              /*accomContentHighlighted*/
              32) {
                transition_in(if_block, 1);
              }
            } else {
              if_block = create_if_block_3$2(ctx);
              if_block.c();
              transition_in(if_block, 1);
              if_block.m(div1, t8);
            }
          } else if (if_block) {
            group_outros();
            transition_out(if_block, 1, 1, () => {
              if_block = null;
            });
            check_outros();
          }

          if (dirty[0] &
          /*newAccom*/
          64) {
            set_input_value(textarea,
            /*newAccom*/
            ctx[6].content);
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
          if (detaching) detach(h3);
          if (detaching) detach(t2);
          if (detaching) detach(form);
          if (if_block) if_block.d();
          mounted = false;
          run_all(dispose);
        }

      };
    } // (167:0) {#if showConfirmModal}


    function create_if_block_1$2(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_1$2]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_1*/
      ctx[26]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*showConfirmModal, toDelete, $settings*/
          388 | dirty[1] &
          /*$$scope*/
          16) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (168:4) <Modal on:forceClose={()=>{ showConfirmModal = false; toDelete = "" }}>


    function create_default_slot_1$2(ctx) {
      let h3;
      let t1;
      let p;
      let t2;
      let t3_value = formatText(
      /*$settings*/
      ctx[8].services, false, false) + "";
      let t3;
      let t4;
      let t5_value = formatText(
      /*$settings*/
      ctx[8].students, false, false) + "";
      let t5;
      let t6;
      let t7_value = formatText(
      /*$settings*/
      ctx[8].services, false, false) + "";
      let t7;
      let t8;
      let t9;
      let div;
      let button0;
      let t11;
      let button1;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          h3.textContent = "Are you sure?";
          t1 = space();
          p = element("p");
          t2 = text("If you delete this ");
          t3 = text(t3_value);
          t4 = text(", it will not be recoverable. This will not affect ");
          t5 = text(t5_value);
          t6 = text("'s committed ");
          t7 = text(t7_value);
          t8 = text(" history.");
          t9 = space();
          div = element("div");
          button0 = element("button");
          button0.textContent = "Delete it";
          t11 = space();
          button1 = element("button");
          button1.textContent = "Never mind";
          attr(button0, "class", "centered");
          attr(button0, "type", "submit");
          attr(button1, "class", "centered blue");
          attr(button1, "type", "submit");
          attr(div, "class", "align-ends");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          insert(target, t1, anchor);
          insert(target, p, anchor);
          append(p, t2);
          append(p, t3);
          append(p, t4);
          append(p, t5);
          append(p, t6);
          append(p, t7);
          append(p, t8);
          insert(target, t9, anchor);
          insert(target, div, anchor);
          append(div, button0);
          append(div, t11);
          append(div, button1);

          if (!mounted) {
            dispose = [listen(button0, "click", prevent_default(
            /*click_handler_4*/
            ctx[24])), listen(button1, "click", prevent_default(
            /*click_handler_5*/
            ctx[25]))];
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*$settings*/
          256 && t3_value !== (t3_value = formatText(
          /*$settings*/
          ctx[8].services, false, false) + "")) set_data(t3, t3_value);
          if (dirty[0] &
          /*$settings*/
          256 && t5_value !== (t5_value = formatText(
          /*$settings*/
          ctx[8].students, false, false) + "")) set_data(t5, t5_value);
          if (dirty[0] &
          /*$settings*/
          256 && t7_value !== (t7_value = formatText(
          /*$settings*/
          ctx[8].services, false, false) + "")) set_data(t7, t7_value);
        },

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t1);
          if (detaching) detach(p);
          if (detaching) detach(t9);
          if (detaching) detach(div);
          mounted = false;
          run_all(dispose);
        }

      };
    } // (178:0) {#if showDeleteConfirmModal}


    function create_if_block$4(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot$2]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_2*/
      ctx[28]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*showDeleteConfirmModal, $settings*/
          264 | dirty[1] &
          /*$$scope*/
          16) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (179:4) <Modal on:forceClose={()=>{ showDeleteConfirmModal = false }}>


    function create_default_slot$2(ctx) {
      let h3;
      let t1;
      let p;
      let t2;
      let t3_value = formatText(
      /*$settings*/
      ctx[8].services, false, false) + "";
      let t3;
      let t4;
      let t5;
      let button;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          h3.textContent = "All done!";
          t1 = space();
          p = element("p");
          t2 = text("The indicated ");
          t3 = text(t3_value);
          t4 = text(" has been removed from the list.");
          t5 = space();
          button = element("button");
          button.textContent = "OK";
          attr(button, "class", "centered blue");
          attr(button, "type", "submit");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          insert(target, t1, anchor);
          insert(target, p, anchor);
          append(p, t2);
          append(p, t3);
          append(p, t4);
          insert(target, t5, anchor);
          insert(target, button, anchor);

          if (!mounted) {
            dispose = listen(button, "click", prevent_default(
            /*click_handler_6*/
            ctx[27]));
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*$settings*/
          256 && t3_value !== (t3_value = formatText(
          /*$settings*/
          ctx[8].services, false, false) + "")) set_data(t3, t3_value);
        },

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t1);
          if (detaching) detach(p);
          if (detaching) detach(t5);
          if (detaching) detach(button);
          mounted = false;
          dispose();
        }

      };
    }

    function create_fragment$9(ctx) {
      let div4;
      let div0;
      let h2;
      let t0_value = formatText(
      /*$settings*/
      ctx[8].services, true, true) + "";
      let t0;
      let t1;
      let div1;
      let label;
      let t3;
      let input;
      let t4;
      let div2;
      let t5;
      let t6_value = formatText(
      /*$settings*/
      ctx[8].services, false, false) + "";
      let t6;
      let t7;
      let t8;
      let div3;
      let a;
      let t9;
      let t10_value = formatText(
      /*$settings*/
      ctx[8].services, false, false) + "";
      let t10;
      let t11;
      let div4_intro;
      let div4_outro;
      let t12;
      let t13;
      let t14;
      let if_block3_anchor;
      let current;
      let mounted;
      let dispose;

      function select_block_type(ctx, dirty) {
        if (
        /*searchResults*/
        ctx[0].length) return create_if_block_4$2;
        return create_else_block$2;
      }

      let current_block_type = select_block_type(ctx);
      let if_block0 = current_block_type(ctx);
      let if_block1 =
      /*accomCreatorOpen*/
      ctx[1] && create_if_block_2$2(ctx);
      let if_block2 =
      /*showConfirmModal*/
      ctx[2] && create_if_block_1$2(ctx);
      let if_block3 =
      /*showDeleteConfirmModal*/
      ctx[3] && create_if_block$4(ctx);
      return {
        c() {
          div4 = element("div");
          div0 = element("div");
          h2 = element("h2");
          t0 = text(t0_value);
          t1 = space();
          div1 = element("div");
          label = element("label");
          label.textContent = "Find:";
          t3 = space();
          input = element("input");
          t4 = space();
          div2 = element("div");
          t5 = text("Search by ");
          t6 = text(t6_value);
          t7 = text(" title or description.");
          t8 = space();
          div3 = element("div");
          a = element("a");
          t9 = text("New ");
          t10 = text(t10_value);
          t11 = space();
          if_block0.c();
          t12 = space();
          if (if_block1) if_block1.c();
          t13 = space();
          if (if_block2) if_block2.c();
          t14 = space();
          if (if_block3) if_block3.c();
          if_block3_anchor = empty();
          attr(div0, "class", "switchable");
          attr(label, "for", "search");
          attr(input, "type", "text");
          attr(input, "id", "search");
          attr(div1, "class", "form-halves");
          attr(a, "href", "newAccom");
          attr(div3, "class", "mt-2 mb-1");
          set_style(div4, "position", "relative");
        },

        m(target, anchor) {
          insert(target, div4, anchor);
          append(div4, div0);
          append(div0, h2);
          append(h2, t0);
          append(div4, t1);
          append(div4, div1);
          append(div1, label);
          append(div1, t3);
          append(div1, input);
          /*input_binding*/

          ctx[13](input);
          append(div4, t4);
          append(div4, div2);
          append(div2, t5);
          append(div2, t6);
          append(div2, t7);
          append(div4, t8);
          append(div4, div3);
          append(div3, a);
          append(a, t9);
          append(a, t10);
          append(div4, t11);
          if_block0.m(div4, null);
          insert(target, t12, anchor);
          if (if_block1) if_block1.m(target, anchor);
          insert(target, t13, anchor);
          if (if_block2) if_block2.m(target, anchor);
          insert(target, t14, anchor);
          if (if_block3) if_block3.m(target, anchor);
          insert(target, if_block3_anchor, anchor);
          current = true;

          if (!mounted) {
            dispose = [listen(input, "keyup",
            /*keyup_handler*/
            ctx[14]), listen(a, "click", prevent_default(
            /*click_handler*/
            ctx[15]))];
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if ((!current || dirty[0] &
          /*$settings*/
          256) && t0_value !== (t0_value = formatText(
          /*$settings*/
          ctx[8].services, true, true) + "")) set_data(t0, t0_value);
          if ((!current || dirty[0] &
          /*$settings*/
          256) && t6_value !== (t6_value = formatText(
          /*$settings*/
          ctx[8].services, false, false) + "")) set_data(t6, t6_value);
          if ((!current || dirty[0] &
          /*$settings*/
          256) && t10_value !== (t10_value = formatText(
          /*$settings*/
          ctx[8].services, false, false) + "")) set_data(t10, t10_value);

          if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
            if_block0.p(ctx, dirty);
          } else {
            if_block0.d(1);
            if_block0 = current_block_type(ctx);

            if (if_block0) {
              if_block0.c();
              if_block0.m(div4, null);
            }
          }

          if (
          /*accomCreatorOpen*/
          ctx[1]) {
            if (if_block1) {
              if_block1.p(ctx, dirty);

              if (dirty[0] &
              /*accomCreatorOpen*/
              2) {
                transition_in(if_block1, 1);
              }
            } else {
              if_block1 = create_if_block_2$2(ctx);
              if_block1.c();
              transition_in(if_block1, 1);
              if_block1.m(t13.parentNode, t13);
            }
          } else if (if_block1) {
            group_outros();
            transition_out(if_block1, 1, 1, () => {
              if_block1 = null;
            });
            check_outros();
          }

          if (
          /*showConfirmModal*/
          ctx[2]) {
            if (if_block2) {
              if_block2.p(ctx, dirty);

              if (dirty[0] &
              /*showConfirmModal*/
              4) {
                transition_in(if_block2, 1);
              }
            } else {
              if_block2 = create_if_block_1$2(ctx);
              if_block2.c();
              transition_in(if_block2, 1);
              if_block2.m(t14.parentNode, t14);
            }
          } else if (if_block2) {
            group_outros();
            transition_out(if_block2, 1, 1, () => {
              if_block2 = null;
            });
            check_outros();
          }

          if (
          /*showDeleteConfirmModal*/
          ctx[3]) {
            if (if_block3) {
              if_block3.p(ctx, dirty);

              if (dirty[0] &
              /*showDeleteConfirmModal*/
              8) {
                transition_in(if_block3, 1);
              }
            } else {
              if_block3 = create_if_block$4(ctx);
              if_block3.c();
              transition_in(if_block3, 1);
              if_block3.m(if_block3_anchor.parentNode, if_block3_anchor);
            }
          } else if (if_block3) {
            group_outros();
            transition_out(if_block3, 1, 1, () => {
              if_block3 = null;
            });
            check_outros();
          }
        },

        i(local) {
          if (current) return;
          add_render_callback(() => {
            if (div4_outro) div4_outro.end(1);
            if (!div4_intro) div4_intro = create_in_transition(div4, fly, {
              x: 100,
              delay: 500
            });
            div4_intro.start();
          });
          transition_in(if_block1);
          transition_in(if_block2);
          transition_in(if_block3);
          current = true;
        },

        o(local) {
          if (div4_intro) div4_intro.invalidate();
          div4_outro = create_out_transition(div4, fly, {
            x: 100
          });
          transition_out(if_block1);
          transition_out(if_block2);
          transition_out(if_block3);
          current = false;
        },

        d(detaching) {
          if (detaching) detach(div4);
          /*input_binding*/

          ctx[13](null);
          if_block0.d();
          if (detaching && div4_outro) div4_outro.end();
          if (detaching) detach(t12);
          if (if_block1) if_block1.d(detaching);
          if (detaching) detach(t13);
          if (if_block2) if_block2.d(detaching);
          if (detaching) detach(t14);
          if (if_block3) if_block3.d(detaching);
          if (detaching) detach(if_block3_anchor);
          mounted = false;
          run_all(dispose);
        }

      };
    }

    function instance$9($$self, $$props, $$invalidate) {
      let $settings;
      component_subscribe($$self, settings, $$value => $$invalidate(8, $settings = $$value));
      let accoms = [];
      let searchResults = [];
      let accomCreatorOpen = false;
      let showConfirmModal = false;
      let showDeleteConfirmModal = false;
      let searchTimeout = null;
      let searchBox = null;
      let accomContentHighlighted = false;
      let newAccom = {
        name: "",
        content: ""
      };
      let toDelete = "";
      let fuse = null;

      let save = () => {
        saveAccommodation(newAccom, $settings.databasedir).then(() => {
          loadAccommodations($settings.databasedir).then(accomsLoaded => {
            accoms = accomsLoaded;
            $$invalidate(1, accomCreatorOpen = false);
            $$invalidate(6, newAccom = {
              name: "",
              content: ""
            });
            fuse = new Fuse(accoms, {
              keys: ["name", "content"]
            });
            searchTime(searchBox.value);
          });
        });
      };

      let searchTime = search => {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          if (search == "") $$invalidate(0, searchResults = accoms);else $$invalidate(0, searchResults = fuse.search(search));
        }, 600);
      };

      let removeAccom = id => {
        $$invalidate(7, toDelete = id);
        $$invalidate(2, showConfirmModal = true);
      };

      let deleteConfirm = id => {
        removeAccommodation(id, $settings.databasedir).then(() => {
          $$invalidate(7, toDelete = "");
          $$invalidate(3, showDeleteConfirmModal = true);
          $$invalidate(2, showConfirmModal = false);
          loadAccommodations($settings.databasedir).then(accomsLoaded => {
            accoms = accomsLoaded;
            $$invalidate(1, accomCreatorOpen = false);
            $$invalidate(6, newAccom = {
              name: "",
              content: ""
            });
            fuse = new Fuse(accoms, {
              keys: ["name", "content"]
            });
            searchTime(searchBox.value);
          });
        });
      };

      onMount(() => {
        loadAccommodations($settings.databasedir).then(accomsLoaded => {
          accoms = accomsLoaded;
          $$invalidate(0, searchResults = accoms);
          fuse = new Fuse(accoms, {
            keys: ["name", "content"]
          });
        });
      });

      function input_binding($$value) {
        binding_callbacks[$$value ? "unshift" : "push"](() => {
          searchBox = $$value;
          $$invalidate(4, searchBox);
        });
      }

      const keyup_handler = () => {
        searchTime(searchBox.value);
      };

      const click_handler = () => {
        $$invalidate(1, accomCreatorOpen = true);
      };

      const click_handler_1 = accom => {
        removeAccom(accom._id);
      };

      const click_handler_2 = accom => {
        $$invalidate(6, newAccom = accom);
        $$invalidate(1, accomCreatorOpen = true);
      };

      function input_input_handler() {
        newAccom.name = this.value;
        $$invalidate(6, newAccom);
      }

      function textarea_input_handler() {
        newAccom.content = this.value;
        $$invalidate(6, newAccom);
      }

      const focus_handler = () => {
        $$invalidate(5, accomContentHighlighted = true);
      };

      const blur_handler = () => {
        $$invalidate(5, accomContentHighlighted = false);
      };

      const click_handler_3 = () => {
        save();
        $$invalidate(1, accomCreatorOpen = false);
      };

      const forceClose_handler = () => {
        $$invalidate(1, accomCreatorOpen = false);
        $$invalidate(6, newAccom = {
          name: "",
          content: ""
        });
      };

      const click_handler_4 = () => {
        deleteConfirm(toDelete);
      };

      const click_handler_5 = () => {
        $$invalidate(2, showConfirmModal = false);
        $$invalidate(7, toDelete = "");
      };

      const forceClose_handler_1 = () => {
        $$invalidate(2, showConfirmModal = false);
        $$invalidate(7, toDelete = "");
      };

      const click_handler_6 = () => {
        $$invalidate(3, showDeleteConfirmModal = false);
      };

      const forceClose_handler_2 = () => {
        $$invalidate(3, showDeleteConfirmModal = false);
      };

      return [searchResults, accomCreatorOpen, showConfirmModal, showDeleteConfirmModal, searchBox, accomContentHighlighted, newAccom, toDelete, $settings, save, searchTime, removeAccom, deleteConfirm, input_binding, keyup_handler, click_handler, click_handler_1, click_handler_2, input_input_handler, textarea_input_handler, focus_handler, blur_handler, click_handler_3, forceClose_handler, click_handler_4, click_handler_5, forceClose_handler_1, click_handler_6, forceClose_handler_2];
    }

    class Accommodations extends SvelteComponent {
      constructor(options) {
        super();
        init(this, options, instance$9, create_fragment$9, safe_not_equal, {}, [-1, -1]);
      }

    }

    /* src\Settings.svelte generated by Svelte v3.38.3 */

    function get_each_context$8(ctx, list, i) {
      const child_ctx = ctx.slice();
      child_ctx[41] = list[i];
      child_ctx[42] = list;
      child_ctx[43] = i;
      return child_ctx;
    }

    function get_each_context_1$1(ctx, list, i) {
      const child_ctx = ctx.slice();
      child_ctx[44] = list[i];
      child_ctx[45] = list;
      child_ctx[46] = i;
      return child_ctx;
    } // (187:4) {#if $settings.passwords}


    function create_if_block_5$1(ctx) {
      let each_1_anchor;
      let each_value_1 =
      /*$settings*/
      ctx[0].passwords;
      let each_blocks = [];

      for (let i = 0; i < each_value_1.length; i += 1) {
        each_blocks[i] = create_each_block_1$1(get_each_context_1$1(ctx, each_value_1, i));
      }

      return {
        c() {
          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].c();
          }

          each_1_anchor = empty();
        },

        m(target, anchor) {
          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].m(target, anchor);
          }

          insert(target, each_1_anchor, anchor);
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*$settings, openPagesDialog*/
          513) {
            each_value_1 =
            /*$settings*/
            ctx[0].passwords;
            let i;

            for (i = 0; i < each_value_1.length; i += 1) {
              const child_ctx = get_each_context_1$1(ctx, each_value_1, i);

              if (each_blocks[i]) {
                each_blocks[i].p(child_ctx, dirty);
              } else {
                each_blocks[i] = create_each_block_1$1(child_ctx);
                each_blocks[i].c();
                each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
              }
            }

            for (; i < each_blocks.length; i += 1) {
              each_blocks[i].d(1);
            }

            each_blocks.length = each_value_1.length;
          }
        },

        d(detaching) {
          destroy_each(each_blocks, detaching);
          if (detaching) detach(each_1_anchor);
        }

      };
    } // (188:8) {#each $settings.passwords as password, i}


    function create_each_block_1$1(ctx) {
      let div1;
      let input0;
      let t0;
      let input1;
      let input1_value_value;
      let t1;
      let div0;
      let t3;
      let mounted;
      let dispose;

      function input0_input_handler_1() {
        /*input0_input_handler_1*/
        ctx[17].call(input0,
        /*each_value_1*/
        ctx[45],
        /*i*/
        ctx[46]);
      }

      function click_handler() {
        return (
          /*click_handler*/
          ctx[19](
          /*password*/
          ctx[44],
          /*i*/
          ctx[46])
        );
      }

      function click_handler_1() {
        return (
          /*click_handler_1*/
          ctx[20](
          /*i*/
          ctx[46])
        );
      }

      return {
        c() {
          div1 = element("div");
          input0 = element("input");
          t0 = space();
          input1 = element("input");
          t1 = space();
          div0 = element("div");
          div0.textContent = "×";
          t3 = space();
          attr(input0, "type", "text");
          attr(input0, "placeholder", "Password");
          attr(input1, "type", "text");
          attr(input1, "class", "select-pages svelte-tb0b9n");
          attr(input1, "placeholder", "Pages");
          input1.value = input1_value_value =
          /*password*/
          ctx[44].pages.map(func).join(", ");
          input1.readOnly = true;
          attr(div0, "class", "close");
          attr(div1, "class", "passwords whitebox");
        },

        m(target, anchor) {
          insert(target, div1, anchor);
          append(div1, input0);
          set_input_value(input0,
          /*password*/
          ctx[44].password);
          append(div1, t0);
          append(div1, input1);
          append(div1, t1);
          append(div1, div0);
          append(div1, t3);

          if (!mounted) {
            dispose = [listen(input0, "input", input0_input_handler_1), listen(input0, "change",
            /*change_handler*/
            ctx[18]), listen(input1, "click", click_handler), listen(div0, "click", click_handler_1)];
            mounted = true;
          }
        },

        p(new_ctx, dirty) {
          ctx = new_ctx;

          if (dirty[0] &
          /*$settings*/
          1 && input0.value !==
          /*password*/
          ctx[44].password) {
            set_input_value(input0,
            /*password*/
            ctx[44].password);
          }

          if (dirty[0] &
          /*$settings*/
          1 && input1_value_value !== (input1_value_value =
          /*password*/
          ctx[44].pages.map(func).join(", ")) && input1.value !== input1_value_value) {
            input1.value = input1_value_value;
          }
        },

        d(detaching) {
          if (detaching) detach(div1);
          mounted = false;
          run_all(dispose);
        }

      };
    } // (212:0) {#if showPagesModal}


    function create_if_block_4$3(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_4$1]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler*/
      ctx[26]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*pages, $settings*/
          65 | dirty[1] &
          /*$$scope*/
          65536) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (216:12) {#each pages as page}


    function create_each_block$8(ctx) {
      let li;
      let t_value =
      /*page*/
      ctx[41].name + "";
      let t;
      let mounted;
      let dispose;

      function click_handler_6() {
        return (
          /*click_handler_6*/
          ctx[25](
          /*page*/
          ctx[41],
          /*each_value*/
          ctx[42],
          /*page_index*/
          ctx[43])
        );
      }

      return {
        c() {
          li = element("li");
          t = text(t_value);
          attr(li, "class", "svelte-tb0b9n");
          toggle_class(li, "selected",
          /*page*/
          ctx[41].selected);
        },

        m(target, anchor) {
          insert(target, li, anchor);
          append(li, t);

          if (!mounted) {
            dispose = listen(li, "click", click_handler_6);
            mounted = true;
          }
        },

        p(new_ctx, dirty) {
          ctx = new_ctx;
          if (dirty[0] &
          /*pages*/
          64 && t_value !== (t_value =
          /*page*/
          ctx[41].name + "")) set_data(t, t_value);

          if (dirty[0] &
          /*pages*/
          64) {
            toggle_class(li, "selected",
            /*page*/
            ctx[41].selected);
          }
        },

        d(detaching) {
          if (detaching) detach(li);
          mounted = false;
          dispose();
        }

      };
    } // (213:4) <Modal on:forceClose={()=>{ showPagesModal = false }}>


    function create_default_slot_4$1(ctx) {
      let h3;
      let t0;
      let t1_value = formatText(
      /*$settings*/
      ctx[0].services, true, true) + "";
      let t1;
      let t2;
      let ul;
      let t3;
      let button;
      let mounted;
      let dispose;
      let each_value =
      /*pages*/
      ctx[6];
      let each_blocks = [];

      for (let i = 0; i < each_value.length; i += 1) {
        each_blocks[i] = create_each_block$8(get_each_context$8(ctx, each_value, i));
      }

      return {
        c() {
          h3 = element("h3");
          t0 = text("Select ");
          t1 = text(t1_value);
          t2 = space();
          ul = element("ul");

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].c();
          }

          t3 = space();
          button = element("button");
          button.textContent = "OK";
          attr(ul, "id", "pages-list");
          attr(ul, "class", "svelte-tb0b9n");
          attr(button, "class", "centered blue");
          attr(button, "type", "submit");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          append(h3, t0);
          append(h3, t1);
          insert(target, t2, anchor);
          insert(target, ul, anchor);

          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].m(ul, null);
          }

          insert(target, t3, anchor);
          insert(target, button, anchor);

          if (!mounted) {
            dispose = listen(button, "click", prevent_default(
            /*savePageSettings*/
            ctx[10]));
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*$settings*/
          1 && t1_value !== (t1_value = formatText(
          /*$settings*/
          ctx[0].services, true, true) + "")) set_data(t1, t1_value);

          if (dirty[0] &
          /*pages, $settings*/
          65) {
            each_value =
            /*pages*/
            ctx[6];
            let i;

            for (i = 0; i < each_value.length; i += 1) {
              const child_ctx = get_each_context$8(ctx, each_value, i);

              if (each_blocks[i]) {
                each_blocks[i].p(child_ctx, dirty);
              } else {
                each_blocks[i] = create_each_block$8(child_ctx);
                each_blocks[i].c();
                each_blocks[i].m(ul, null);
              }
            }

            for (; i < each_blocks.length; i += 1) {
              each_blocks[i].d(1);
            }

            each_blocks.length = each_value.length;
          }
        },

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t2);
          if (detaching) detach(ul);
          destroy_each(each_blocks, detaching);
          if (detaching) detach(t3);
          if (detaching) detach(button);
          mounted = false;
          dispose();
        }

      };
    } // (224:0) {#if showBackupSuccessfulModal}


    function create_if_block_3$3(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_3$1]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_1*/
      ctx[28]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*showBackupSuccessfulModal*/
          4 | dirty[1] &
          /*$$scope*/
          65536) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (225:4) <Modal on:forceClose={()=>{ showBackupSuccessfulModal = false }}>


    function create_default_slot_3$1(ctx) {
      let h3;
      let t1;
      let p;
      let t3;
      let button;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          h3.textContent = "Backup Successful";
          t1 = space();
          p = element("p");
          p.textContent = "All data has been backed up to a folder marked with the current date and time.";
          t3 = space();
          button = element("button");
          button.textContent = "OK";
          attr(button, "class", "centered blue");
          attr(button, "type", "submit");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          insert(target, t1, anchor);
          insert(target, p, anchor);
          insert(target, t3, anchor);
          insert(target, button, anchor);

          if (!mounted) {
            dispose = listen(button, "click", prevent_default(
            /*click_handler_7*/
            ctx[27]));
            mounted = true;
          }
        },

        p: noop,

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t1);
          if (detaching) detach(p);
          if (detaching) detach(t3);
          if (detaching) detach(button);
          mounted = false;
          dispose();
        }

      };
    } // (232:0) {#if showRestoreSuccessfulModal}


    function create_if_block_2$3(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_2$3]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_2*/
      ctx[30]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*showRestoreSuccessfulModal*/
          8 | dirty[1] &
          /*$$scope*/
          65536) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (233:4) <Modal on:forceClose={()=>{ showRestoreSuccessfulModal = false }}>


    function create_default_slot_2$3(ctx) {
      let h3;
      let t1;
      let p;
      let t3;
      let button;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          h3.textContent = "Restore Successful";
          t1 = space();
          p = element("p");
          p.textContent = "All data has been restored from the selected folder.";
          t3 = space();
          button = element("button");
          button.textContent = "OK";
          attr(button, "class", "centered blue");
          attr(button, "type", "submit");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          insert(target, t1, anchor);
          insert(target, p, anchor);
          insert(target, t3, anchor);
          insert(target, button, anchor);

          if (!mounted) {
            dispose = listen(button, "click", prevent_default(
            /*click_handler_8*/
            ctx[29]));
            mounted = true;
          }
        },

        p: noop,

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t1);
          if (detaching) detach(p);
          if (detaching) detach(t3);
          if (detaching) detach(button);
          mounted = false;
          dispose();
        }

      };
    } // (240:0) {#if clearDataModal}


    function create_if_block_1$3(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_1$3]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_3*/
      ctx[32]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*clearDataModal*/
          16 | dirty[1] &
          /*$$scope*/
          65536) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (241:4) <Modal on:forceClose={()=>{ clearDataModal = false }}>


    function create_default_slot_1$3(ctx) {
      let h3;
      let t1;
      let p;
      let t5;
      let div;
      let button0;
      let t7;
      let button1;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          h3.textContent = "Clear Data?";
          t1 = space();
          p = element("p");
          p.innerHTML = `We strongly recommend that you <strong>back up your data first</strong> before clearing the database.`;
          t5 = space();
          div = element("div");
          button0 = element("button");
          button0.textContent = "Clear Data";
          t7 = space();
          button1 = element("button");
          button1.textContent = "Cancel";
          attr(button0, "type", "submit");
          attr(button1, "class", "blue");
          attr(button1, "type", "submit");
          attr(div, "class", "centered inline");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          insert(target, t1, anchor);
          insert(target, p, anchor);
          insert(target, t5, anchor);
          insert(target, div, anchor);
          append(div, button0);
          append(div, t7);
          append(div, button1);

          if (!mounted) {
            dispose = [listen(button0, "click", prevent_default(
            /*clearData*/
            ctx[13])), listen(button1, "click", prevent_default(
            /*click_handler_9*/
            ctx[31]))];
            mounted = true;
          }
        },

        p: noop,

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t1);
          if (detaching) detach(p);
          if (detaching) detach(t5);
          if (detaching) detach(div);
          mounted = false;
          run_all(dispose);
        }

      };
    } // (251:0) {#if showDeletedModal}


    function create_if_block$5(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot$3]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_4*/
      ctx[34]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty[0] &
          /*showDeletedModal*/
          32 | dirty[1] &
          /*$$scope*/
          65536) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (252:4) <Modal on:forceClose={()=>{ showDeletedModal = false }}>


    function create_default_slot$3(ctx) {
      let h3;
      let t1;
      let p;
      let t3;
      let button;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          h3.textContent = "Data Deletion Successful";
          t1 = space();
          p = element("p");
          p.textContent = "All data has been cleared from the database.";
          t3 = space();
          button = element("button");
          button.textContent = "OK";
          attr(button, "class", "centered blue");
          attr(button, "type", "submit");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          insert(target, t1, anchor);
          insert(target, p, anchor);
          insert(target, t3, anchor);
          insert(target, button, anchor);

          if (!mounted) {
            dispose = listen(button, "click", prevent_default(
            /*click_handler_10*/
            ctx[33]));
            mounted = true;
          }
        },

        p: noop,

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t1);
          if (detaching) detach(p);
          if (detaching) detach(t3);
          if (detaching) detach(button);
          mounted = false;
          dispose();
        }

      };
    }

    function create_fragment$a(ctx) {
      let div1;
      let h20;
      let t1;
      let h30;
      let t3;
      let p0;
      let t5;
      let input0;
      let t6;
      let p1;
      let t8;
      let input1;
      let t9;
      let p2;
      let t11;
      let input2;
      let t12;
      let h21;
      let t14;
      let p3;
      let t18;
      let t19;
      let button0;
      let t21;
      let h22;
      let t23;
      let h31;
      let t25;
      let p4;
      let t26;
      let a0;
      let t27_value =
      /*$settings*/
      ctx[0].systemdir + "";
      let t27;
      let t28;
      let p5;
      let t29;
      let a1;
      let t30_value =
      /*$settings*/
      ctx[0].databasedir + "";
      let t30;
      let t31;
      let p6;
      let t32;
      let a2;
      let t33_value =
      /*$settings*/
      ctx[0].backupdir + "";
      let t33;
      let t34;
      let h32;
      let t36;
      let div0;
      let button1;
      let t38;
      let button2;
      let t40;
      let button3;
      let div1_intro;
      let div1_outro;
      let t42;
      let t43;
      let t44;
      let t45;
      let t46;
      let if_block5_anchor;
      let current;
      let mounted;
      let dispose;
      let if_block0 =
      /*$settings*/
      ctx[0].passwords && create_if_block_5$1(ctx);
      let if_block1 =
      /*showPagesModal*/
      ctx[1] && create_if_block_4$3(ctx);
      let if_block2 =
      /*showBackupSuccessfulModal*/
      ctx[2] && create_if_block_3$3(ctx);
      let if_block3 =
      /*showRestoreSuccessfulModal*/
      ctx[3] && create_if_block_2$3(ctx);
      let if_block4 =
      /*clearDataModal*/
      ctx[4] && create_if_block_1$3(ctx);
      let if_block5 =
      /*showDeletedModal*/
      ctx[5] && create_if_block$5(ctx);
      return {
        c() {
          div1 = element("div");
          h20 = element("h2");
          h20.textContent = "Settings";
          t1 = space();
          h30 = element("h3");
          h30.textContent = "Terminology";
          t3 = space();
          p0 = element("p");
          p0.textContent = "What do you call the document this app helps you to create? (Use an abbreviation or common name if possible; for example, \"LOA\" for \"Letter of Accommodation\")";
          t5 = space();
          input0 = element("input");
          t6 = space();
          p1 = element("p");
          p1.textContent = "What do you call the services you provide? (eg accommodations, services, supports)";
          t8 = space();
          input1 = element("input");
          t9 = space();
          p2 = element("p");
          p2.textContent = "What do you call the people you serve? (eg students, clients, customers)";
          t11 = space();
          input2 = element("input");
          t12 = space();
          h21 = element("h2");
          h21.textContent = "Security";
          t14 = space();
          p3 = element("p");
          p3.innerHTML = `You can set up passwords for the various pages of Accommodate to implement nominal security. <strong>This is not strong security, and will not prevent access to a determined attacker.</strong> All settings can be overridden easily by altering app files. It is expected that this app will be stored in a location with sufficient access restrictions. This password system is only meant to discourage accidental alteration to app settings and data by unauthorized (but non-malicious) users.`;
          t18 = space();
          if (if_block0) if_block0.c();
          t19 = space();
          button0 = element("button");
          button0.textContent = "Add password";
          t21 = space();
          h22 = element("h2");
          h22.textContent = "Data";
          t23 = space();
          h31 = element("h3");
          h31.textContent = "Sources";
          t25 = space();
          p4 = element("p");
          t26 = text("System data is located here: ");
          a0 = element("a");
          t27 = text(t27_value);
          t28 = space();
          p5 = element("p");
          t29 = text("The database files for this app are located here: ");
          a1 = element("a");
          t30 = text(t30_value);
          t31 = space();
          p6 = element("p");
          t32 = text("The database backups are located here: ");
          a2 = element("a");
          t33 = text(t33_value);
          t34 = space();
          h32 = element("h3");
          h32.textContent = "Manage Data";
          t36 = space();
          div0 = element("div");
          button1 = element("button");
          button1.textContent = "Back up data";
          t38 = space();
          button2 = element("button");
          button2.textContent = "Restore backup";
          t40 = space();
          button3 = element("button");
          button3.textContent = "Clear data";
          t42 = space();
          if (if_block1) if_block1.c();
          t43 = space();
          if (if_block2) if_block2.c();
          t44 = space();
          if (if_block3) if_block3.c();
          t45 = space();
          if (if_block4) if_block4.c();
          t46 = space();
          if (if_block5) if_block5.c();
          if_block5_anchor = empty();
          attr(input0, "type", "text");
          attr(input1, "type", "text");
          attr(input2, "type", "text");
          attr(button0, "type", "submit");
          attr(button0, "class", "blue");
          attr(a0, "href", "changepath");
          attr(a1, "href", "changepath");
          attr(a2, "href", "changepath");
          attr(button1, "type", "submit");
          attr(button1, "class", "blue");
          attr(button2, "type", "submit");
          attr(button2, "class", "blue");
          attr(button3, "type", "submit");
          attr(div0, "class", "inline");
          set_style(div1, "position", "relative");
        },

        m(target, anchor) {
          insert(target, div1, anchor);
          append(div1, h20);
          append(div1, t1);
          append(div1, h30);
          append(div1, t3);
          append(div1, p0);
          append(div1, t5);
          append(div1, input0);
          set_input_value(input0,
          /*$settings*/
          ctx[0].abbrev);
          append(div1, t6);
          append(div1, p1);
          append(div1, t8);
          append(div1, input1);
          set_input_value(input1,
          /*$settings*/
          ctx[0].services);
          append(div1, t9);
          append(div1, p2);
          append(div1, t11);
          append(div1, input2);
          set_input_value(input2,
          /*$settings*/
          ctx[0].students);
          append(div1, t12);
          append(div1, h21);
          append(div1, t14);
          append(div1, p3);
          append(div1, t18);
          if (if_block0) if_block0.m(div1, null);
          append(div1, t19);
          append(div1, button0);
          append(div1, t21);
          append(div1, h22);
          append(div1, t23);
          append(div1, h31);
          append(div1, t25);
          append(div1, p4);
          append(p4, t26);
          append(p4, a0);
          append(a0, t27);
          append(div1, t28);
          append(div1, p5);
          append(p5, t29);
          append(p5, a1);
          append(a1, t30);
          append(div1, t31);
          append(div1, p6);
          append(p6, t32);
          append(p6, a2);
          append(a2, t33);
          append(div1, t34);
          append(div1, h32);
          append(div1, t36);
          append(div1, div0);
          append(div0, button1);
          append(div0, t38);
          append(div0, button2);
          append(div0, t40);
          append(div0, button3);
          insert(target, t42, anchor);
          if (if_block1) if_block1.m(target, anchor);
          insert(target, t43, anchor);
          if (if_block2) if_block2.m(target, anchor);
          insert(target, t44, anchor);
          if (if_block3) if_block3.m(target, anchor);
          insert(target, t45, anchor);
          if (if_block4) if_block4.m(target, anchor);
          insert(target, t46, anchor);
          if (if_block5) if_block5.m(target, anchor);
          insert(target, if_block5_anchor, anchor);
          current = true;

          if (!mounted) {
            dispose = [listen(input0, "input",
            /*input0_input_handler*/
            ctx[14]), listen(input1, "input",
            /*input1_input_handler*/
            ctx[15]), listen(input2, "input",
            /*input2_input_handler*/
            ctx[16]), listen(button0, "click", prevent_default(
            /*addPassword*/
            ctx[8])), listen(a0, "click", prevent_default(
            /*click_handler_2*/
            ctx[21])), listen(a1, "click", prevent_default(
            /*click_handler_3*/
            ctx[22])), listen(a2, "click", prevent_default(
            /*click_handler_4*/
            ctx[23])), listen(button1, "click", prevent_default(
            /*backup*/
            ctx[11])), listen(button2, "click", prevent_default(
            /*restoreBackup*/
            ctx[12])), listen(button3, "click", prevent_default(
            /*click_handler_5*/
            ctx[24]))];
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if (dirty[0] &
          /*$settings*/
          1 && input0.value !==
          /*$settings*/
          ctx[0].abbrev) {
            set_input_value(input0,
            /*$settings*/
            ctx[0].abbrev);
          }

          if (dirty[0] &
          /*$settings*/
          1 && input1.value !==
          /*$settings*/
          ctx[0].services) {
            set_input_value(input1,
            /*$settings*/
            ctx[0].services);
          }

          if (dirty[0] &
          /*$settings*/
          1 && input2.value !==
          /*$settings*/
          ctx[0].students) {
            set_input_value(input2,
            /*$settings*/
            ctx[0].students);
          }

          if (
          /*$settings*/
          ctx[0].passwords) {
            if (if_block0) {
              if_block0.p(ctx, dirty);
            } else {
              if_block0 = create_if_block_5$1(ctx);
              if_block0.c();
              if_block0.m(div1, t19);
            }
          } else if (if_block0) {
            if_block0.d(1);
            if_block0 = null;
          }

          if ((!current || dirty[0] &
          /*$settings*/
          1) && t27_value !== (t27_value =
          /*$settings*/
          ctx[0].systemdir + "")) set_data(t27, t27_value);
          if ((!current || dirty[0] &
          /*$settings*/
          1) && t30_value !== (t30_value =
          /*$settings*/
          ctx[0].databasedir + "")) set_data(t30, t30_value);
          if ((!current || dirty[0] &
          /*$settings*/
          1) && t33_value !== (t33_value =
          /*$settings*/
          ctx[0].backupdir + "")) set_data(t33, t33_value);

          if (
          /*showPagesModal*/
          ctx[1]) {
            if (if_block1) {
              if_block1.p(ctx, dirty);

              if (dirty[0] &
              /*showPagesModal*/
              2) {
                transition_in(if_block1, 1);
              }
            } else {
              if_block1 = create_if_block_4$3(ctx);
              if_block1.c();
              transition_in(if_block1, 1);
              if_block1.m(t43.parentNode, t43);
            }
          } else if (if_block1) {
            group_outros();
            transition_out(if_block1, 1, 1, () => {
              if_block1 = null;
            });
            check_outros();
          }

          if (
          /*showBackupSuccessfulModal*/
          ctx[2]) {
            if (if_block2) {
              if_block2.p(ctx, dirty);

              if (dirty[0] &
              /*showBackupSuccessfulModal*/
              4) {
                transition_in(if_block2, 1);
              }
            } else {
              if_block2 = create_if_block_3$3(ctx);
              if_block2.c();
              transition_in(if_block2, 1);
              if_block2.m(t44.parentNode, t44);
            }
          } else if (if_block2) {
            group_outros();
            transition_out(if_block2, 1, 1, () => {
              if_block2 = null;
            });
            check_outros();
          }

          if (
          /*showRestoreSuccessfulModal*/
          ctx[3]) {
            if (if_block3) {
              if_block3.p(ctx, dirty);

              if (dirty[0] &
              /*showRestoreSuccessfulModal*/
              8) {
                transition_in(if_block3, 1);
              }
            } else {
              if_block3 = create_if_block_2$3(ctx);
              if_block3.c();
              transition_in(if_block3, 1);
              if_block3.m(t45.parentNode, t45);
            }
          } else if (if_block3) {
            group_outros();
            transition_out(if_block3, 1, 1, () => {
              if_block3 = null;
            });
            check_outros();
          }

          if (
          /*clearDataModal*/
          ctx[4]) {
            if (if_block4) {
              if_block4.p(ctx, dirty);

              if (dirty[0] &
              /*clearDataModal*/
              16) {
                transition_in(if_block4, 1);
              }
            } else {
              if_block4 = create_if_block_1$3(ctx);
              if_block4.c();
              transition_in(if_block4, 1);
              if_block4.m(t46.parentNode, t46);
            }
          } else if (if_block4) {
            group_outros();
            transition_out(if_block4, 1, 1, () => {
              if_block4 = null;
            });
            check_outros();
          }

          if (
          /*showDeletedModal*/
          ctx[5]) {
            if (if_block5) {
              if_block5.p(ctx, dirty);

              if (dirty[0] &
              /*showDeletedModal*/
              32) {
                transition_in(if_block5, 1);
              }
            } else {
              if_block5 = create_if_block$5(ctx);
              if_block5.c();
              transition_in(if_block5, 1);
              if_block5.m(if_block5_anchor.parentNode, if_block5_anchor);
            }
          } else if (if_block5) {
            group_outros();
            transition_out(if_block5, 1, 1, () => {
              if_block5 = null;
            });
            check_outros();
          }
        },

        i(local) {
          if (current) return;
          add_render_callback(() => {
            if (div1_outro) div1_outro.end(1);
            if (!div1_intro) div1_intro = create_in_transition(div1, fly, {
              x: 100,
              delay: 500
            });
            div1_intro.start();
          });
          transition_in(if_block1);
          transition_in(if_block2);
          transition_in(if_block3);
          transition_in(if_block4);
          transition_in(if_block5);
          current = true;
        },

        o(local) {
          if (div1_intro) div1_intro.invalidate();
          div1_outro = create_out_transition(div1, fly, {
            x: 100
          });
          transition_out(if_block1);
          transition_out(if_block2);
          transition_out(if_block3);
          transition_out(if_block4);
          transition_out(if_block5);
          current = false;
        },

        d(detaching) {
          if (detaching) detach(div1);
          if (if_block0) if_block0.d();
          if (detaching && div1_outro) div1_outro.end();
          if (detaching) detach(t42);
          if (if_block1) if_block1.d(detaching);
          if (detaching) detach(t43);
          if (if_block2) if_block2.d(detaching);
          if (detaching) detach(t44);
          if (if_block3) if_block3.d(detaching);
          if (detaching) detach(t45);
          if (if_block4) if_block4.d(detaching);
          if (detaching) detach(t46);
          if (if_block5) if_block5.d(detaching);
          if (detaching) detach(if_block5_anchor);
          mounted = false;
          run_all(dispose);
        }

      };
    }

    const func = el => el.name;

    function instance$a($$self, $$props, $$invalidate) {
      let $settings;
      component_subscribe($$self, settings, $$value => $$invalidate(0, $settings = $$value));

      const {
        dialog
      } = require("electron").remote;

      const fs = require("fs");

      const app = require("electron").remote.app;

      const getFolder = alter => {
        dialog.showOpenDialog({
          properties: ["openDirectory"]
        }).then(res => {
          if (res.filePaths[0] != undefined) set_store_value(settings, $settings[alter] = res.filePaths[0], $settings);
        });
      };

      let showPagesModal = false;
      let showBackupSuccessfulModal = false;
      let showRestoreSuccessfulModal = false;
      let clearDataModal = false;
      let showDeletedModal = false;
      let pages = [{
        name: "Write " + formatText($settings.abbrev, false, false, true),
        value: "#write",
        selected: false
      }, {
        name: formatText($settings.students, true, true),
        selected: false,
        value: "#students"
      }, {
        name: formatText($settings.services, true, true),
        selected: false,
        value: "#accommodations"
      }, {
        name: formatText($settings.abbrev, false, false, true) + " Template",
        selected: false,
        value: "#pdf"
      }, {
        name: "Settings",
        selected: false,
        value: "#settings"
      }, {
        name: "Reports",
        selected: false,
        value: "#reports"
      }];
      let saveTimeout = null;
      let curPassIndex = 0;

      let save = () => {
        console.log("saving");
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          changeSettings($settings);
        }, 3000);
      };

      let addPassword = () => {
        if (!$settings.passwords) set_store_value(settings, $settings.passwords = [], $settings);
        $settings.passwords.push({
          password: "",
          pages: []
        });
        settings.set($settings);
      };

      let openPagesDialog = (password, index) => {
        //Clear selections
        pages.forEach(page => {
          //Deselect the page by default
          page.selected = false; //If password object already has pages selected, select them in the pages array

          if (password.pages) {
            password.pages.forEach(pwordpage => {
              if (pwordpage.name == page.name) {
                page.selected = true;
              }
            });
          }
        });
        curPassIndex = index;
        $$invalidate(1, showPagesModal = true);
      };

      let savePageSettings = () => {
        set_store_value(settings, $settings.passwords[curPassIndex].pages = pages.filter(page => page.selected), $settings);
        $$invalidate(1, showPagesModal = false);
      };

      function backup() {
        let now = new Date();
        let backupDate = now.getMonth() + 1 + "." + now.getDate() + "." + now.getFullYear() + "-" + now.getTime();

        if (!fs.existsSync($settings.backupdir + "/" + backupDate)) {
          fs.mkdirSync($settings.backupdir + "/" + backupDate);
        }

        fs.copyFile($settings.databasedir + "/accoms.db", $settings.backupdir + "/" + backupDate + "/accoms.db", fs.constants.COPYFILE_EXCL, err => {
          if (err) throw err;
          fs.copyFile($settings.databasedir + "/loas.db", $settings.backupdir + "/" + backupDate + "/loas.db", fs.constants.COPYFILE_EXCL, err => {
            if (err) throw err;
            fs.copyFile($settings.databasedir + "/records.db", $settings.backupdir + "/" + backupDate + "/records.db", fs.constants.COPYFILE_EXCL, err => {
              if (err) throw err;
              $$invalidate(2, showBackupSuccessfulModal = true);
            });
          });
        });
      }

      function restoreBackup() {
        dialog.showOpenDialog({
          properties: ["openDirectory"],
          defaultPath: $settings.backupdir
        }).then(res => {
          if (res.filePaths[0] != undefined) {
            let restoreFrom = res.filePaths[0];
            fs.copyFile(restoreFrom + "/accoms.db", $settings.databasedir + "/accoms.db", fs.constants.COPYFILE_FICLONE, err => {
              if (err) throw err;
              fs.copyFile(restoreFrom + "/loas.db", $settings.databasedir + "/loas.db", fs.constants.COPYFILE_FICLONE, err => {
                if (err) throw err;
                fs.copyFile(restoreFrom + "/records.db", $settings.databasedir + "/records.db", fs.constants.COPYFILE_FICLONE, err => {
                  if (err) throw err;
                  $$invalidate(3, showRestoreSuccessfulModal = true);
                });
              });
            });
          }
        });
      }

      function clearData() {
        $$invalidate(4, clearDataModal = false);
        fs.unlink($settings.databasedir + "/accoms.db", () => {
          fs.unlink($settings.databasedir + "/loas.db", () => {
            fs.unlink($settings.databasedir + "/records.db", () => {
              $$invalidate(5, showDeletedModal = true);
            });
          });
        });
      }

      function input0_input_handler() {
        $settings.abbrev = this.value;
        settings.set($settings);
      }

      function input1_input_handler() {
        $settings.services = this.value;
        settings.set($settings);
      }

      function input2_input_handler() {
        $settings.students = this.value;
        settings.set($settings);
      }

      function input0_input_handler_1(each_value_1, i) {
        each_value_1[i].password = this.value;
        settings.set($settings);
      }

      const change_handler = () => {
        settings.set($settings);
      };

      const click_handler = (password, i) => {
        openPagesDialog(password, i);
      };

      const click_handler_1 = i => {
        $settings.passwords.splice(i, 1);
        settings.set($settings);
      };

      const click_handler_2 = () => {
        getFolder("systemdir");
      };

      const click_handler_3 = () => {
        getFolder("databasedir");
      };

      const click_handler_4 = () => {
        getFolder("backupdir");
      };

      const click_handler_5 = () => {
        $$invalidate(4, clearDataModal = true);
      };

      const click_handler_6 = (page, each_value, page_index) => {
        $$invalidate(6, each_value[page_index].selected = !page.selected, pages);
        settings.set($settings);
      };

      const forceClose_handler = () => {
        $$invalidate(1, showPagesModal = false);
      };

      const click_handler_7 = () => {
        $$invalidate(2, showBackupSuccessfulModal = false);
      };

      const forceClose_handler_1 = () => {
        $$invalidate(2, showBackupSuccessfulModal = false);
      };

      const click_handler_8 = () => {
        $$invalidate(3, showRestoreSuccessfulModal = false);
      };

      const forceClose_handler_2 = () => {
        $$invalidate(3, showRestoreSuccessfulModal = false);
      };

      const click_handler_9 = () => {
        $$invalidate(4, clearDataModal = false);
      };

      const forceClose_handler_3 = () => {
        $$invalidate(4, clearDataModal = false);
      };

      const click_handler_10 = () => {
        $$invalidate(5, showDeletedModal = false);
      };

      const forceClose_handler_4 = () => {
        $$invalidate(5, showDeletedModal = false);
      };

      $$self.$$.update = () => {
        if ($$self.$$.dirty[0] &
        /*$settings*/
        1) {
           save();
        }
      };

      return [$settings, showPagesModal, showBackupSuccessfulModal, showRestoreSuccessfulModal, clearDataModal, showDeletedModal, pages, getFolder, addPassword, openPagesDialog, savePageSettings, backup, restoreBackup, clearData, input0_input_handler, input1_input_handler, input2_input_handler, input0_input_handler_1, change_handler, click_handler, click_handler_1, click_handler_2, click_handler_3, click_handler_4, click_handler_5, click_handler_6, forceClose_handler, click_handler_7, forceClose_handler_1, click_handler_8, forceClose_handler_2, click_handler_9, forceClose_handler_3, click_handler_10, forceClose_handler_4];
    }

    class Settings extends SvelteComponent {
      constructor(options) {
        super();
        init(this, options, instance$a, create_fragment$a, safe_not_equal, {}, [-1, -1]);
      }

    }

    /* src\Record.svelte generated by Svelte v3.38.3 */

    function get_each_context$9(ctx, list, i) {
      const child_ctx = ctx.slice();
      child_ctx[14] = list[i];
      return child_ctx;
    }

    function get_each_context_1$2(ctx, list, i) {
      const child_ctx = ctx.slice();
      child_ctx[17] = list[i];
      return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
      const child_ctx = ctx.slice();
      child_ctx[14] = list[i];
      return child_ctx;
    } // (54:0) {#if record}


    function create_if_block_2$4(ctx) {
      let div;
      let h2;
      let t0;
      let t1_value =
      /*record*/
      ctx[0].student.lname + ", " +
      /*record*/
      ctx[0].student.fname + " (" +
      /*record*/
      ctx[0].student._id + ")" + "";
      let t1;
      let t2;
      let a;
      let t3;
      let t4_value = formatText(
      /*$settings*/
      ctx[3].students, true, false) + "";
      let t4;
      let t5;
      let h30;
      let t6;
      let t7_value = formatText(
      /*$settings*/
      ctx[3].services, true, true) + "";
      let t7;
      let t8;
      let ul0;
      let t9;
      let h31;
      let t10_value = formatText(
      /*$settings*/
      ctx[3].abbrev, false, false, true) + "";
      let t10;
      let t11;
      let t12;
      let ul1;
      let div_intro;
      let div_outro;
      let current;

      function select_block_type(ctx, dirty) {
        if (
        /*record*/
        ctx[0].accoms &&
        /*record*/
        ctx[0].accoms.length) return create_if_block_4$4;
        return create_else_block_2$1;
      }

      let current_block_type = select_block_type(ctx);
      let if_block0 = current_block_type(ctx);

      function select_block_type_1(ctx, dirty) {
        if (
        /*record*/
        ctx[0].records &&
        /*record*/
        ctx[0].records.length) return create_if_block_3$4;
        return create_else_block_1$1;
      }

      let current_block_type_1 = select_block_type_1(ctx);
      let if_block1 = current_block_type_1(ctx);
      return {
        c() {
          div = element("div");
          h2 = element("h2");
          t0 = text("Record for ");
          t1 = text(t1_value);
          t2 = space();
          a = element("a");
          t3 = text("Back to ");
          t4 = text(t4_value);
          t5 = space();
          h30 = element("h3");
          t6 = text("Current ");
          t7 = text(t7_value);
          t8 = space();
          ul0 = element("ul");
          if_block0.c();
          t9 = space();
          h31 = element("h3");
          t10 = text(t10_value);
          t11 = text(" Documents");
          t12 = space();
          ul1 = element("ul");
          if_block1.c();
          attr(a, "href", "#students");
          set_style(div, "position", "relative");
        },

        m(target, anchor) {
          insert(target, div, anchor);
          append(div, h2);
          append(h2, t0);
          append(h2, t1);
          append(div, t2);
          append(div, a);
          append(a, t3);
          append(a, t4);
          append(div, t5);
          append(div, h30);
          append(h30, t6);
          append(h30, t7);
          append(div, t8);
          append(div, ul0);
          if_block0.m(ul0, null);
          append(div, t9);
          append(div, h31);
          append(h31, t10);
          append(h31, t11);
          append(div, t12);
          append(div, ul1);
          if_block1.m(ul1, null);
          current = true;
        },

        p(ctx, dirty) {
          if ((!current || dirty &
          /*record*/
          1) && t1_value !== (t1_value =
          /*record*/
          ctx[0].student.lname + ", " +
          /*record*/
          ctx[0].student.fname + " (" +
          /*record*/
          ctx[0].student._id + ")" + "")) set_data(t1, t1_value);
          if ((!current || dirty &
          /*$settings*/
          8) && t4_value !== (t4_value = formatText(
          /*$settings*/
          ctx[3].students, true, false) + "")) set_data(t4, t4_value);
          if ((!current || dirty &
          /*$settings*/
          8) && t7_value !== (t7_value = formatText(
          /*$settings*/
          ctx[3].services, true, true) + "")) set_data(t7, t7_value);

          if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
            if_block0.p(ctx, dirty);
          } else {
            if_block0.d(1);
            if_block0 = current_block_type(ctx);

            if (if_block0) {
              if_block0.c();
              if_block0.m(ul0, null);
            }
          }

          if ((!current || dirty &
          /*$settings*/
          8) && t10_value !== (t10_value = formatText(
          /*$settings*/
          ctx[3].abbrev, false, false, true) + "")) set_data(t10, t10_value);

          if (current_block_type_1 === (current_block_type_1 = select_block_type_1(ctx)) && if_block1) {
            if_block1.p(ctx, dirty);
          } else {
            if_block1.d(1);
            if_block1 = current_block_type_1(ctx);

            if (if_block1) {
              if_block1.c();
              if_block1.m(ul1, null);
            }
          }
        },

        i(local) {
          if (current) return;
          add_render_callback(() => {
            if (div_outro) div_outro.end(1);
            if (!div_intro) div_intro = create_in_transition(div, fly, {
              x: 100,
              delay: 500
            });
            div_intro.start();
          });
          current = true;
        },

        o(local) {
          if (div_intro) div_intro.invalidate();
          div_outro = create_out_transition(div, fly, {
            x: 100
          });
          current = false;
        },

        d(detaching) {
          if (detaching) detach(div);
          if_block0.d();
          if_block1.d();
          if (detaching && div_outro) div_outro.end();
        }

      };
    } // (64:12) {:else}


    function create_else_block_2$1(ctx) {
      let li;
      return {
        c() {
          li = element("li");
          li.textContent = "None listed";
        },

        m(target, anchor) {
          insert(target, li, anchor);
        },

        p: noop,

        d(detaching) {
          if (detaching) detach(li);
        }

      };
    } // (60:12) {#if record.accoms && record.accoms.length}


    function create_if_block_4$4(ctx) {
      let each_1_anchor;
      let each_value_2 =
      /*record*/
      ctx[0].accoms;
      let each_blocks = [];

      for (let i = 0; i < each_value_2.length; i += 1) {
        each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
      }

      return {
        c() {
          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].c();
          }

          each_1_anchor = empty();
        },

        m(target, anchor) {
          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].m(target, anchor);
          }

          insert(target, each_1_anchor, anchor);
        },

        p(ctx, dirty) {
          if (dirty &
          /*record*/
          1) {
            each_value_2 =
            /*record*/
            ctx[0].accoms;
            let i;

            for (i = 0; i < each_value_2.length; i += 1) {
              const child_ctx = get_each_context_2(ctx, each_value_2, i);

              if (each_blocks[i]) {
                each_blocks[i].p(child_ctx, dirty);
              } else {
                each_blocks[i] = create_each_block_2(child_ctx);
                each_blocks[i].c();
                each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
              }
            }

            for (; i < each_blocks.length; i += 1) {
              each_blocks[i].d(1);
            }

            each_blocks.length = each_value_2.length;
          }
        },

        d(detaching) {
          destroy_each(each_blocks, detaching);
          if (detaching) detach(each_1_anchor);
        }

      };
    } // (61:16) {#each record.accoms as accom}


    function create_each_block_2(ctx) {
      let li;
      let t_value =
      /*accom*/
      ctx[14].name + "";
      let t;
      return {
        c() {
          li = element("li");
          t = text(t_value);
        },

        m(target, anchor) {
          insert(target, li, anchor);
          append(li, t);
        },

        p(ctx, dirty) {
          if (dirty &
          /*record*/
          1 && t_value !== (t_value =
          /*accom*/
          ctx[14].name + "")) set_data(t, t_value);
        },

        d(detaching) {
          if (detaching) detach(li);
        }

      };
    } // (79:12) {:else}


    function create_else_block_1$1(ctx) {
      let li;
      return {
        c() {
          li = element("li");
          li.textContent = "None listed";
        },

        m(target, anchor) {
          insert(target, li, anchor);
        },

        p: noop,

        d(detaching) {
          if (detaching) detach(li);
        }

      };
    } // (71:12) {#if record.records && record.records.length}


    function create_if_block_3$4(ctx) {
      let each_1_anchor;
      let each_value_1 =
      /*record*/
      ctx[0].records.sort(
      /*func*/
      ctx[5]);
      let each_blocks = [];

      for (let i = 0; i < each_value_1.length; i += 1) {
        each_blocks[i] = create_each_block_1$2(get_each_context_1$2(ctx, each_value_1, i));
      }

      return {
        c() {
          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].c();
          }

          each_1_anchor = empty();
        },

        m(target, anchor) {
          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].m(target, anchor);
          }

          insert(target, each_1_anchor, anchor);
        },

        p(ctx, dirty) {
          if (dirty &
          /*record, currentRecord, Date, recordModalOpen*/
          7) {
            each_value_1 =
            /*record*/
            ctx[0].records.sort(
            /*func*/
            ctx[5]);
            let i;

            for (i = 0; i < each_value_1.length; i += 1) {
              const child_ctx = get_each_context_1$2(ctx, each_value_1, i);

              if (each_blocks[i]) {
                each_blocks[i].p(child_ctx, dirty);
              } else {
                each_blocks[i] = create_each_block_1$2(child_ctx);
                each_blocks[i].c();
                each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
              }
            }

            for (; i < each_blocks.length; i += 1) {
              each_blocks[i].d(1);
            }

            each_blocks.length = each_value_1.length;
          }
        },

        d(detaching) {
          destroy_each(each_blocks, detaching);
          if (detaching) detach(each_1_anchor);
        }

      };
    } // (72:16) {#each record.records.sort((a, b)=> new Date(b.dateUpdated) - new Date(a.dateUpdated)) as doc}


    function create_each_block_1$2(ctx) {
      let li;
      let a;
      let t0_value = "Issued " + new Date(
      /*doc*/
      ctx[17].dateUpdated).toDateString() + "";
      let t0;
      let a_href_value;
      let t1;
      let mounted;
      let dispose;

      function click_handler() {
        return (
          /*click_handler*/
          ctx[6](
          /*doc*/
          ctx[17])
        );
      }

      return {
        c() {
          li = element("li");
          a = element("a");
          t0 = text(t0_value);
          t1 = space();
          attr(a, "href", a_href_value = "#record/" +
          /*record*/
          ctx[0].records._id);
        },

        m(target, anchor) {
          insert(target, li, anchor);
          append(li, a);
          append(a, t0);
          append(li, t1);

          if (!mounted) {
            dispose = listen(a, "click", prevent_default(click_handler));
            mounted = true;
          }
        },

        p(new_ctx, dirty) {
          ctx = new_ctx;
          if (dirty &
          /*record*/
          1 && t0_value !== (t0_value = "Issued " + new Date(
          /*doc*/
          ctx[17].dateUpdated).toDateString() + "")) set_data(t0, t0_value);

          if (dirty &
          /*record*/
          1 && a_href_value !== (a_href_value = "#record/" +
          /*record*/
          ctx[0].records._id)) {
            attr(a, "href", a_href_value);
          }
        },

        d(detaching) {
          if (detaching) detach(li);
          mounted = false;
          dispose();
        }

      };
    } // (86:0) {#if recordModalOpen}


    function create_if_block$6(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot$4]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler*/
      ctx[9]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty &
          /*$$scope, recordModalOpen, currentRecord, $settings*/
          4194318) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (111:16) {:else}


    function create_else_block$3(ctx) {
      let li;
      let t0;
      let t1_value = formatText(
      /*$settings*/
      ctx[3].services, true, false) + "";
      let t1;
      let t2;
      return {
        c() {
          li = element("li");
          t0 = text("No ");
          t1 = text(t1_value);
          t2 = text(" listed");
        },

        m(target, anchor) {
          insert(target, li, anchor);
          append(li, t0);
          append(li, t1);
          append(li, t2);
        },

        p(ctx, dirty) {
          if (dirty &
          /*$settings*/
          8 && t1_value !== (t1_value = formatText(
          /*$settings*/
          ctx[3].services, true, false) + "")) set_data(t1, t1_value);
        },

        d(detaching) {
          if (detaching) detach(li);
        }

      };
    } // (104:16) {#if currentRecord.accoms.length > 0}


    function create_if_block_1$4(ctx) {
      let each_1_anchor;
      let each_value =
      /*currentRecord*/
      ctx[1].accoms;
      let each_blocks = [];

      for (let i = 0; i < each_value.length; i += 1) {
        each_blocks[i] = create_each_block$9(get_each_context$9(ctx, each_value, i));
      }

      return {
        c() {
          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].c();
          }

          each_1_anchor = empty();
        },

        m(target, anchor) {
          for (let i = 0; i < each_blocks.length; i += 1) {
            each_blocks[i].m(target, anchor);
          }

          insert(target, each_1_anchor, anchor);
        },

        p(ctx, dirty) {
          if (dirty &
          /*currentRecord*/
          2) {
            each_value =
            /*currentRecord*/
            ctx[1].accoms;
            let i;

            for (i = 0; i < each_value.length; i += 1) {
              const child_ctx = get_each_context$9(ctx, each_value, i);

              if (each_blocks[i]) {
                each_blocks[i].p(child_ctx, dirty);
              } else {
                each_blocks[i] = create_each_block$9(child_ctx);
                each_blocks[i].c();
                each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
              }
            }

            for (; i < each_blocks.length; i += 1) {
              each_blocks[i].d(1);
            }

            each_blocks.length = each_value.length;
          }
        },

        d(detaching) {
          destroy_each(each_blocks, detaching);
          if (detaching) detach(each_1_anchor);
        }

      };
    } // (105:20) {#each currentRecord.accoms as accom}


    function create_each_block$9(ctx) {
      let li;
      let h4;
      let t0_value =
      /*accom*/
      ctx[14].name + "";
      let t0;
      let t1;
      let p;
      let t2_value =
      /*accom*/
      ctx[14].content + "";
      let t2;
      let t3;
      return {
        c() {
          li = element("li");
          h4 = element("h4");
          t0 = text(t0_value);
          t1 = space();
          p = element("p");
          t2 = text(t2_value);
          t3 = space();
          attr(li, "class", "whitebox");
        },

        m(target, anchor) {
          insert(target, li, anchor);
          append(li, h4);
          append(h4, t0);
          append(li, t1);
          append(li, p);
          append(p, t2);
          append(li, t3);
        },

        p(ctx, dirty) {
          if (dirty &
          /*currentRecord*/
          2 && t0_value !== (t0_value =
          /*accom*/
          ctx[14].name + "")) set_data(t0, t0_value);
          if (dirty &
          /*currentRecord*/
          2 && t2_value !== (t2_value =
          /*accom*/
          ctx[14].content + "")) set_data(t2, t2_value);
        },

        d(detaching) {
          if (detaching) detach(li);
        }

      };
    } // (87:4) <Modal on:forceClose={()=>{ recordModalOpen = false; currentRecord = {} }}>


    function create_default_slot$4(ctx) {
      let div1;
      let h3;
      let t0_value = new Date(
      /*currentRecord*/
      ctx[1].dateUpdated).getMonth() + 1 + "/" + new Date(
      /*currentRecord*/
      ctx[1].dateUpdated).getDate() + "/" + new Date(
      /*currentRecord*/
      ctx[1].dateUpdated).getFullYear() + "";
      let t0;
      let t1;
      let p0;
      let strong0;
      let t3_value = new Date(
      /*currentRecord*/
      ctx[1].dateUpdated).getMonth() + 1 + "/" + new Date(
      /*currentRecord*/
      ctx[1].dateUpdated).getDate() + "/" + new Date(
      /*currentRecord*/
      ctx[1].dateUpdated).getFullYear() + "";
      let t3;
      let t4;
      let h40;
      let t5_value = formatText(
      /*$settings*/
      ctx[3].students, false, true) + "";
      let t5;
      let t6;
      let t7;
      let p1;
      let strong1;
      let t9_value =
      /*currentRecord*/
      ctx[1].student.lname + ", " +
      /*currentRecord*/
      ctx[1].student.fname + "";
      let t9;
      let t10;
      let br;
      let t11;
      let strong2;
      let t13_value =
      /*currentRecord*/
      ctx[1].student._id + "";
      let t13;
      let t14;
      let h41;
      let t15;
      let t16_value = formatText(
      /*$settings*/
      ctx[3].services, true, true) + "";
      let t16;
      let t17;
      let ul;
      let t18;
      let h42;
      let t19_value = formatText(
      /*$settings*/
      ctx[3].students, false, true) + "";
      let t19;
      let t20;
      let t21;
      let p2;
      let t22_value = (
      /*currentRecord*/
      ctx[1].studentNotes ?
      /*currentRecord*/
      ctx[1].studentNotes : "Nothing specified") + "";
      let t22;
      let t23;
      let div0;
      let button0;
      let t25;
      let button1;
      let mounted;
      let dispose;

      function select_block_type_2(ctx, dirty) {
        if (
        /*currentRecord*/
        ctx[1].accoms.length > 0) return create_if_block_1$4;
        return create_else_block$3;
      }

      let current_block_type = select_block_type_2(ctx);
      let if_block = current_block_type(ctx);
      return {
        c() {
          div1 = element("div");
          h3 = element("h3");
          t0 = text(t0_value);
          t1 = space();
          p0 = element("p");
          strong0 = element("strong");
          strong0.textContent = "Date updated: ";
          t3 = text(t3_value);
          t4 = space();
          h40 = element("h4");
          t5 = text(t5_value);
          t6 = text(" Information");
          t7 = space();
          p1 = element("p");
          strong1 = element("strong");
          strong1.textContent = "Name: ";
          t9 = text(t9_value);
          t10 = space();
          br = element("br");
          t11 = space();
          strong2 = element("strong");
          strong2.textContent = "ID: ";
          t13 = text(t13_value);
          t14 = space();
          h41 = element("h4");
          t15 = text("Approved ");
          t16 = text(t16_value);
          t17 = space();
          ul = element("ul");
          if_block.c();
          t18 = space();
          h42 = element("h4");
          t19 = text(t19_value);
          t20 = text(" Notes");
          t21 = space();
          p2 = element("p");
          t22 = text(t22_value);
          t23 = space();
          div0 = element("div");
          button0 = element("button");
          button0.textContent = "OK";
          t25 = space();
          button1 = element("button");
          button1.textContent = "Print";
          attr(h3, "class", "svelte-13qs8b5");
          attr(p0, "class", "mt-0");
          attr(p1, "class", "mt-0");
          attr(ul, "id", "accoms-list");
          attr(ul, "class", "svelte-13qs8b5");
          attr(p2, "class", "mt-0");
          attr(button0, "class", "centered blue");
          attr(button0, "type", "submit");
          attr(button1, "class", "centered");
          attr(button1, "type", "submit");
          attr(div0, "class", "align-ends");
          attr(div1, "class", "record-inner svelte-13qs8b5");
        },

        m(target, anchor) {
          insert(target, div1, anchor);
          append(div1, h3);
          append(h3, t0);
          append(div1, t1);
          append(div1, p0);
          append(p0, strong0);
          append(p0, t3);
          append(div1, t4);
          append(div1, h40);
          append(h40, t5);
          append(h40, t6);
          append(div1, t7);
          append(div1, p1);
          append(p1, strong1);
          append(p1, t9);
          append(p1, t10);
          append(p1, br);
          append(p1, t11);
          append(p1, strong2);
          append(p1, t13);
          append(div1, t14);
          append(div1, h41);
          append(h41, t15);
          append(h41, t16);
          append(div1, t17);
          append(div1, ul);
          if_block.m(ul, null);
          append(div1, t18);
          append(div1, h42);
          append(h42, t19);
          append(h42, t20);
          append(div1, t21);
          append(div1, p2);
          append(p2, t22);
          append(div1, t23);
          append(div1, div0);
          append(div0, button0);
          append(div0, t25);
          append(div0, button1);

          if (!mounted) {
            dispose = [listen(button0, "click", prevent_default(
            /*click_handler_1*/
            ctx[7])), listen(button1, "click", prevent_default(
            /*click_handler_2*/
            ctx[8]))];
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if (dirty &
          /*currentRecord*/
          2 && t0_value !== (t0_value = new Date(
          /*currentRecord*/
          ctx[1].dateUpdated).getMonth() + 1 + "/" + new Date(
          /*currentRecord*/
          ctx[1].dateUpdated).getDate() + "/" + new Date(
          /*currentRecord*/
          ctx[1].dateUpdated).getFullYear() + "")) set_data(t0, t0_value);
          if (dirty &
          /*currentRecord*/
          2 && t3_value !== (t3_value = new Date(
          /*currentRecord*/
          ctx[1].dateUpdated).getMonth() + 1 + "/" + new Date(
          /*currentRecord*/
          ctx[1].dateUpdated).getDate() + "/" + new Date(
          /*currentRecord*/
          ctx[1].dateUpdated).getFullYear() + "")) set_data(t3, t3_value);
          if (dirty &
          /*$settings*/
          8 && t5_value !== (t5_value = formatText(
          /*$settings*/
          ctx[3].students, false, true) + "")) set_data(t5, t5_value);
          if (dirty &
          /*currentRecord*/
          2 && t9_value !== (t9_value =
          /*currentRecord*/
          ctx[1].student.lname + ", " +
          /*currentRecord*/
          ctx[1].student.fname + "")) set_data(t9, t9_value);
          if (dirty &
          /*currentRecord*/
          2 && t13_value !== (t13_value =
          /*currentRecord*/
          ctx[1].student._id + "")) set_data(t13, t13_value);
          if (dirty &
          /*$settings*/
          8 && t16_value !== (t16_value = formatText(
          /*$settings*/
          ctx[3].services, true, true) + "")) set_data(t16, t16_value);

          if (current_block_type === (current_block_type = select_block_type_2(ctx)) && if_block) {
            if_block.p(ctx, dirty);
          } else {
            if_block.d(1);
            if_block = current_block_type(ctx);

            if (if_block) {
              if_block.c();
              if_block.m(ul, null);
            }
          }

          if (dirty &
          /*$settings*/
          8 && t19_value !== (t19_value = formatText(
          /*$settings*/
          ctx[3].students, false, true) + "")) set_data(t19, t19_value);
          if (dirty &
          /*currentRecord*/
          2 && t22_value !== (t22_value = (
          /*currentRecord*/
          ctx[1].studentNotes ?
          /*currentRecord*/
          ctx[1].studentNotes : "Nothing specified") + "")) set_data(t22, t22_value);
        },

        d(detaching) {
          if (detaching) detach(div1);
          if_block.d();
          mounted = false;
          run_all(dispose);
        }

      };
    }

    function create_fragment$b(ctx) {
      let t;
      let if_block1_anchor;
      let current;
      let if_block0 =
      /*record*/
      ctx[0] && create_if_block_2$4(ctx);
      let if_block1 =
      /*recordModalOpen*/
      ctx[2] && create_if_block$6(ctx);
      return {
        c() {
          if (if_block0) if_block0.c();
          t = space();
          if (if_block1) if_block1.c();
          if_block1_anchor = empty();
        },

        m(target, anchor) {
          if (if_block0) if_block0.m(target, anchor);
          insert(target, t, anchor);
          if (if_block1) if_block1.m(target, anchor);
          insert(target, if_block1_anchor, anchor);
          current = true;
        },

        p(ctx, [dirty]) {
          if (
          /*record*/
          ctx[0]) {
            if (if_block0) {
              if_block0.p(ctx, dirty);

              if (dirty &
              /*record*/
              1) {
                transition_in(if_block0, 1);
              }
            } else {
              if_block0 = create_if_block_2$4(ctx);
              if_block0.c();
              transition_in(if_block0, 1);
              if_block0.m(t.parentNode, t);
            }
          } else if (if_block0) {
            group_outros();
            transition_out(if_block0, 1, 1, () => {
              if_block0 = null;
            });
            check_outros();
          }

          if (
          /*recordModalOpen*/
          ctx[2]) {
            if (if_block1) {
              if_block1.p(ctx, dirty);

              if (dirty &
              /*recordModalOpen*/
              4) {
                transition_in(if_block1, 1);
              }
            } else {
              if_block1 = create_if_block$6(ctx);
              if_block1.c();
              transition_in(if_block1, 1);
              if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
            }
          } else if (if_block1) {
            group_outros();
            transition_out(if_block1, 1, 1, () => {
              if_block1 = null;
            });
            check_outros();
          }
        },

        i(local) {
          if (current) return;
          transition_in(if_block0);
          transition_in(if_block1);
          current = true;
        },

        o(local) {
          transition_out(if_block0);
          transition_out(if_block1);
          current = false;
        },

        d(detaching) {
          if (if_block0) if_block0.d(detaching);
          if (detaching) detach(t);
          if (if_block1) if_block1.d(detaching);
          if (detaching) detach(if_block1_anchor);
        }

      };
    }

    function instance$b($$self, $$props, $$invalidate) {
      let $settings;
      component_subscribe($$self, settings, $$value => $$invalidate(3, $settings = $$value));

      const {
        shell
      } = require("electron");

      const fs = require("fs");

      let sid = "";
      let record = null;
      let currentRecord = {};
      let recordModalOpen = false;
      let bodyData;

      function printDoc(data) {
        let formattedData = [{
          key: "first name",
          value: data.student.fname
        }, {
          key: "last name",
          value: data.student.lname
        }, {
          key: "id",
          value: data.student._id
        }, {
          key: "date",
          value: new Date(data.dateUpdated).getMonth() + 1 + "/" + new Date(data.dateUpdated).getDate() + "/" + new Date(data.dateUpdated).getFullYear()
        }, {
          key: formatText($settings.services, true, false),
          value: data.accoms
        }, {
          key: formatText($settings.students, false, false) + " notes",
          value: data.studentNotes
        }];
        printPDF(" ", bodyData, " ", formattedData).then(html => {
          fs.writeFileSync($settings.systemdir + "/target.html", html);
          shell.openItem($settings.systemdir + "/target.html");
        }).catch(e => {
          console.log(e);
          previewModalOpen = false;
          docErrorModalOpen = true;
        });
        $$invalidate(1, currentRecord = {});
      }

      onMount(() => {
        sid = window.location.hash.split("/")[1];
        loadRecords(sid, $settings.databasedir).then(result => {
          $$invalidate(0, record = result);
        });
        bodyData = fs.existsSync($settings.systemdir + "/body.accom") ? fs.readFileSync($settings.systemdir + "/body.accom") : "";
      });

      const func = (a, b) => new Date(b.dateUpdated) - new Date(a.dateUpdated);

      const click_handler = doc => {
        $$invalidate(1, currentRecord = doc);
        $$invalidate(2, recordModalOpen = true);
      };

      const click_handler_1 = () => {
        $$invalidate(2, recordModalOpen = false);
        $$invalidate(1, currentRecord = {});
      };

      const click_handler_2 = () => {
        $$invalidate(2, recordModalOpen = false);
        printDoc(currentRecord);
      };

      const forceClose_handler = () => {
        $$invalidate(2, recordModalOpen = false);
        $$invalidate(1, currentRecord = {});
      };

      return [record, currentRecord, recordModalOpen, $settings, printDoc, func, click_handler, click_handler_1, click_handler_2, forceClose_handler];
    }

    class Record extends SvelteComponent {
      constructor(options) {
        super();
        init(this, options, instance$b, create_fragment$b, safe_not_equal, {});
      }

    }

    /* src\PDF.svelte generated by Svelte v3.38.3 */

    function create_fragment$c(ctx) {
      let p;
      let t1;
      let div0;
      let span0;
      let t3;
      let span1;
      let t5;
      let span2;
      let t7;
      let span3;
      let t9;
      let span4;
      let t10_value = formatText(
      /*$settings*/
      ctx[1].services, true, true) + "";
      let t10;
      let t11;
      let span5;
      let t12_value = formatText(
      /*$settings*/
      ctx[1].students, false, true) + "";
      let t12;
      let t13;
      let t14;
      let div2;
      let div1;
      let t15;
      let div3;
      let button;
      let mounted;
      let dispose;
      return {
        c() {
          p = element("p");
          p.textContent = "Variables:";
          t1 = space();
          div0 = element("div");
          span0 = element("span");
          span0.textContent = "First name";
          t3 = space();
          span1 = element("span");
          span1.textContent = "Last name";
          t5 = space();
          span2 = element("span");
          span2.textContent = "ID";
          t7 = space();
          span3 = element("span");
          span3.textContent = "Date";
          t9 = space();
          span4 = element("span");
          t10 = text(t10_value);
          t11 = space();
          span5 = element("span");
          t12 = text(t12_value);
          t13 = text(" notes");
          t14 = space();
          div2 = element("div");
          div1 = element("div");
          t15 = space();
          div3 = element("div");
          button = element("button");
          button.textContent = "Save";
          attr(span0, "class", "variableButton svelte-47xvr8");
          attr(span1, "class", "variableButton svelte-47xvr8");
          attr(span2, "class", "variableButton svelte-47xvr8");
          attr(span3, "class", "variableButton svelte-47xvr8");
          attr(span4, "class", "variableButton svelte-47xvr8");
          attr(span5, "class", "variableButton svelte-47xvr8");
          attr(div1, "id", "editor");
          attr(div1, "class", "svelte-47xvr8");
          attr(div2, "id", "container");
          attr(div2, "class", "svelte-47xvr8");
          attr(button, "class", "blue svelte-47xvr8");
          attr(button, "type", "submit");
          attr(div3, "class", "inline svelte-47xvr8");
        },

        m(target, anchor) {
          insert(target, p, anchor);
          insert(target, t1, anchor);
          insert(target, div0, anchor);
          append(div0, span0);
          append(div0, t3);
          append(div0, span1);
          append(div0, t5);
          append(div0, span2);
          append(div0, t7);
          append(div0, span3);
          append(div0, t9);
          append(div0, span4);
          append(span4, t10);
          append(div0, t11);
          append(div0, span5);
          append(span5, t12);
          append(span5, t13);
          insert(target, t14, anchor);
          insert(target, div2, anchor);
          append(div2, div1);
          div1.innerHTML =
          /*content*/
          ctx[0];
          insert(target, t15, anchor);
          insert(target, div3, anchor);
          append(div3, button);

          if (!mounted) {
            dispose = [listen(span0, "click",
            /*click_handler*/
            ctx[6]), listen(span1, "click",
            /*click_handler_1*/
            ctx[7]), listen(span2, "click",
            /*click_handler_2*/
            ctx[8]), listen(span3, "click",
            /*click_handler_3*/
            ctx[9]), listen(span4, "click",
            /*click_handler_4*/
            ctx[10]), listen(span5, "click",
            /*click_handler_5*/
            ctx[11]), listen(button, "click", prevent_default(
            /*click_handler_6*/
            ctx[12]))];
            mounted = true;
          }
        },

        p(ctx, [dirty]) {
          if (dirty &
          /*$settings*/
          2 && t10_value !== (t10_value = formatText(
          /*$settings*/
          ctx[1].services, true, true) + "")) set_data(t10, t10_value);
          if (dirty &
          /*$settings*/
          2 && t12_value !== (t12_value = formatText(
          /*$settings*/
          ctx[1].students, false, true) + "")) set_data(t12, t12_value);
          if (dirty &
          /*content*/
          1) div1.innerHTML =
          /*content*/
          ctx[0];
        },

        i: noop,
        o: noop,

        d(detaching) {
          if (detaching) detach(p);
          if (detaching) detach(t1);
          if (detaching) detach(div0);
          if (detaching) detach(t14);
          if (detaching) detach(div2);
          if (detaching) detach(t15);
          if (detaching) detach(div3);
          mounted = false;
          run_all(dispose);
        }

      };
    }

    function instance$c($$self, $$props, $$invalidate) {
      let $settings;
      component_subscribe($$self, settings, $$value => $$invalidate(1, $settings = $$value));
      const dispatch = createEventDispatcher();
      let {
        pdfSettings
      } = $$props;
      let tiny = tinymce;
      let {
        content
      } = $$props;

      function insertVariable(content) {
        tiny.get("editor").execCommand("mceInsertContent", false, content);
      }

      onMount(() => {
        tinymce.init({
          selector: "#editor",
          plugins: `
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
        });
      });
      onDestroy(() => {
        tiny.get("editor").destroy();
      });

      const click_handler = () => {
        insertVariable("${first name}");
      };

      const click_handler_1 = () => {
        insertVariable("${last name}");
      };

      const click_handler_2 = () => {
        insertVariable("${id}");
      };

      const click_handler_3 = () => {
        insertVariable("${date}");
      };

      const click_handler_4 = () => {
        insertVariable("${" + formatText($settings.services, true, false) + "}");
      };

      const click_handler_5 = () => {
        insertVariable("${" + formatText($settings.students, false, false) + " notes}");
      };

      const click_handler_6 = () => {
        dispatch("save", tiny.get("editor").getContent());
      };

      $$self.$$set = $$props => {
        if ("pdfSettings" in $$props) $$invalidate(5, pdfSettings = $$props.pdfSettings);
        if ("content" in $$props) $$invalidate(0, content = $$props.content);
      };

      return [content, $settings, dispatch, tiny, insertVariable, pdfSettings, click_handler, click_handler_1, click_handler_2, click_handler_3, click_handler_4, click_handler_5, click_handler_6];
    }

    class PDF extends SvelteComponent {
      constructor(options) {
        super();
        init(this, options, instance$c, create_fragment$c, safe_not_equal, {
          pdfSettings: 5,
          content: 0
        });
      }

    }

    /* src\LOATemplate.svelte generated by Svelte v3.38.3 */

    function create_if_block_2$5(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_2$4]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_1*/
      ctx[9]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty &
          /*$$scope*/
          262144) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (113:4) <Modal on:forceClose={()=>{ previewModalOpen = false }}>


    function create_default_slot_2$4(ctx) {
      let h3;
      let t1;
      let p;
      return {
        c() {
          h3 = element("h3");
          h3.textContent = "Rendering Output";
          t1 = space();
          p = element("p");
          p.textContent = "Your preview will be available shortly!";
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          insert(target, t1, anchor);
          insert(target, p, anchor);
        },

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t1);
          if (detaching) detach(p);
        }

      };
    } // (119:0) {#if savedModalOpen}


    function create_if_block_1$5(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_1$4]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_2*/
      ctx[11]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty &
          /*$$scope, savedModalOpen*/
          262152) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (120:4) <Modal on:forceClose={()=>{ savedModalOpen = false }}>


    function create_default_slot_1$4(ctx) {
      let h3;
      let t1;
      let p;
      let t3;
      let button;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          h3.textContent = "Template saved!";
          t1 = space();
          p = element("p");
          p.textContent = "You're good to go!";
          t3 = space();
          button = element("button");
          button.textContent = "OK";
          attr(button, "type", "submit");
          attr(button, "class", "centered blue");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          insert(target, t1, anchor);
          insert(target, p, anchor);
          insert(target, t3, anchor);
          insert(target, button, anchor);

          if (!mounted) {
            dispose = listen(button, "click", prevent_default(
            /*click_handler*/
            ctx[10]));
            mounted = true;
          }
        },

        p: noop,

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t1);
          if (detaching) detach(p);
          if (detaching) detach(t3);
          if (detaching) detach(button);
          mounted = false;
          dispose();
        }

      };
    } // (127:0) {#if docErrorModalOpen}


    function create_if_block$7(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot$5]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_3*/
      ctx[13]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty &
          /*$$scope, docErrorModalOpen*/
          262148) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (128:4) <Modal on:forceClose={()=>{ docErrorModalOpen = false }}>


    function create_default_slot$5(ctx) {
      let h3;
      let t1;
      let p;
      let t3;
      let button;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          h3.textContent = "Whoops!";
          t1 = space();
          p = element("p");
          p.textContent = "There was an error opening your preview. Make sure the document is not already open, and close it if it is.";
          t3 = space();
          button = element("button");
          button.textContent = "OK";
          attr(button, "type", "submit");
          attr(button, "class", "centered blue");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          insert(target, t1, anchor);
          insert(target, p, anchor);
          insert(target, t3, anchor);
          insert(target, button, anchor);

          if (!mounted) {
            dispose = listen(button, "click", prevent_default(
            /*click_handler_1*/
            ctx[12]));
            mounted = true;
          }
        },

        p: noop,

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t1);
          if (detaching) detach(p);
          if (detaching) detach(t3);
          if (detaching) detach(button);
          mounted = false;
          dispose();
        }

      };
    }

    function create_fragment$d(ctx) {
      let div;
      let h2;
      let t0_value = formatText(
      /*$settings*/
      ctx[5].abbrev, false, false, true) + "";
      let t0;
      let t1;
      let t2;
      let p0;
      let t3;
      let t4_value = formatText(
      /*$settings*/
      ctx[5].abbrev, false, false, true) + "";
      let t4;
      let t5;
      let t6;
      let pdf;
      let t7;
      let p1;
      let div_intro;
      let div_outro;
      let t10;
      let t11;
      let t12;
      let if_block2_anchor;
      let current;
      pdf = new PDF({
        props: {
          pdfSettings: {
            editing: "body",
            placeholder: "Write your document here!"
          },
          content:
          /*bodyData*/
          ctx[4]
        }
      });
      pdf.$on("forceClose",
      /*forceClose_handler*/
      ctx[8]);
      pdf.$on("save",
      /*saveBody*/
      ctx[7]);
      pdf.$on("preview",
      /*preview*/
      ctx[6]);
      let if_block0 =
      /*previewModalOpen*/
      ctx[1] && create_if_block_2$5(ctx);
      let if_block1 =
      /*savedModalOpen*/
      ctx[3] && create_if_block_1$5(ctx);
      let if_block2 =
      /*docErrorModalOpen*/
      ctx[2] && create_if_block$7(ctx);
      return {
        c() {
          div = element("div");
          h2 = element("h2");
          t0 = text(t0_value);
          t1 = text(" Template");
          t2 = space();
          p0 = element("p");
          t3 = text("Set up your ");
          t4 = text(t4_value);
          t5 = text(" template below.");
          t6 = space();
          create_component(pdf.$$.fragment);
          t7 = space();
          p1 = element("p");
          p1.innerHTML = `<strong>*NOTE*</strong> - Changing terminology settings on the &quot;Settings&quot; page will change how some variables are processed in the template. You may need to edit your template after terminology changes.`;
          t10 = space();
          if (if_block0) if_block0.c();
          t11 = space();
          if (if_block1) if_block1.c();
          t12 = space();
          if (if_block2) if_block2.c();
          if_block2_anchor = empty();
          set_style(div, "position", "relative");
        },

        m(target, anchor) {
          insert(target, div, anchor);
          append(div, h2);
          append(h2, t0);
          append(h2, t1);
          append(div, t2);
          append(div, p0);
          append(p0, t3);
          append(p0, t4);
          append(p0, t5);
          append(div, t6);
          mount_component(pdf, div, null);
          append(div, t7);
          append(div, p1);
          insert(target, t10, anchor);
          if (if_block0) if_block0.m(target, anchor);
          insert(target, t11, anchor);
          if (if_block1) if_block1.m(target, anchor);
          insert(target, t12, anchor);
          if (if_block2) if_block2.m(target, anchor);
          insert(target, if_block2_anchor, anchor);
          current = true;
        },

        p(ctx, [dirty]) {
          if ((!current || dirty &
          /*$settings*/
          32) && t0_value !== (t0_value = formatText(
          /*$settings*/
          ctx[5].abbrev, false, false, true) + "")) set_data(t0, t0_value);
          if ((!current || dirty &
          /*$settings*/
          32) && t4_value !== (t4_value = formatText(
          /*$settings*/
          ctx[5].abbrev, false, false, true) + "")) set_data(t4, t4_value);
          const pdf_changes = {};
          if (dirty &
          /*bodyData*/
          16) pdf_changes.content =
          /*bodyData*/
          ctx[4];
          pdf.$set(pdf_changes);

          if (
          /*previewModalOpen*/
          ctx[1]) {
            if (if_block0) {
              if_block0.p(ctx, dirty);

              if (dirty &
              /*previewModalOpen*/
              2) {
                transition_in(if_block0, 1);
              }
            } else {
              if_block0 = create_if_block_2$5(ctx);
              if_block0.c();
              transition_in(if_block0, 1);
              if_block0.m(t11.parentNode, t11);
            }
          } else if (if_block0) {
            group_outros();
            transition_out(if_block0, 1, 1, () => {
              if_block0 = null;
            });
            check_outros();
          }

          if (
          /*savedModalOpen*/
          ctx[3]) {
            if (if_block1) {
              if_block1.p(ctx, dirty);

              if (dirty &
              /*savedModalOpen*/
              8) {
                transition_in(if_block1, 1);
              }
            } else {
              if_block1 = create_if_block_1$5(ctx);
              if_block1.c();
              transition_in(if_block1, 1);
              if_block1.m(t12.parentNode, t12);
            }
          } else if (if_block1) {
            group_outros();
            transition_out(if_block1, 1, 1, () => {
              if_block1 = null;
            });
            check_outros();
          }

          if (
          /*docErrorModalOpen*/
          ctx[2]) {
            if (if_block2) {
              if_block2.p(ctx, dirty);

              if (dirty &
              /*docErrorModalOpen*/
              4) {
                transition_in(if_block2, 1);
              }
            } else {
              if_block2 = create_if_block$7(ctx);
              if_block2.c();
              transition_in(if_block2, 1);
              if_block2.m(if_block2_anchor.parentNode, if_block2_anchor);
            }
          } else if (if_block2) {
            group_outros();
            transition_out(if_block2, 1, 1, () => {
              if_block2 = null;
            });
            check_outros();
          }
        },

        i(local) {
          if (current) return;
          transition_in(pdf.$$.fragment, local);
          add_render_callback(() => {
            if (div_outro) div_outro.end(1);
            if (!div_intro) div_intro = create_in_transition(div, fly, {
              x: 100,
              delay: 500
            });
            div_intro.start();
          });
          transition_in(if_block0);
          transition_in(if_block1);
          transition_in(if_block2);
          current = true;
        },

        o(local) {
          transition_out(pdf.$$.fragment, local);
          if (div_intro) div_intro.invalidate();
          div_outro = create_out_transition(div, fly, {
            x: 100
          });
          transition_out(if_block0);
          transition_out(if_block1);
          transition_out(if_block2);
          current = false;
        },

        d(detaching) {
          if (detaching) detach(div);
          destroy_component(pdf);
          if (detaching && div_outro) div_outro.end();
          if (detaching) detach(t10);
          if (if_block0) if_block0.d(detaching);
          if (detaching) detach(t11);
          if (if_block1) if_block1.d(detaching);
          if (detaching) detach(t12);
          if (if_block2) if_block2.d(detaching);
          if (detaching) detach(if_block2_anchor);
        }

      };
    }
    let headerData = ""; //fs.existsSync(root + '/accommodateData/header.accom') ? fs.readFileSync(root + '/accommodateData/header.accom') : ""

    let footerData = ""; //fs.existsSync(root + '/accommodateData/footer.accom') ? fs.readFileSync(root + '/accommodateData/footer.accom') : ""

    function instance$d($$self, $$props, $$invalidate) {
      let $settings;
      component_subscribe($$self, settings, $$value => $$invalidate(5, $settings = $$value));

      const {
        shell
      } = require("electron");

      const fs = require("fs");

      const app = require("electron").remote.app;

      let pdfBodyModalOpen = false;
      let previewModalOpen = false;
      let docErrorModalOpen = false;
      let savedModalOpen = false;
      let bodyData = fs.existsSync($settings.systemdir + "/body.accom") ? fs.readFileSync($settings.systemdir + "/body.accom") : "";
      let sampleData = [{
        key: "first name",
        value: "Sample"
      }, {
        key: "last name",
        value: formatText($settings.students, false, true)
      }, {
        key: "id",
        value: "12345"
      }, {
        key: "date",
        value: ""
      }, // { key: formatText($settings.services, true, false), value: "No " + formatText($settings.services, true, false) + " listed" },
      {
        key: formatText($settings.services, true, false),
        value: [{
          name: "Good times",
          content: "For all"
        }, {
          name: "Love it",
          content: "Don't list it"
        }]
      }, {
        key: formatText($settings.students, false, false) + " notes",
        value: "No notes listed"
      }];

      let preview = () => {
        $$invalidate(1, previewModalOpen = true); //Get date

        let today = new Date();
        sampleData[3].value = today.getMonth() + 1 + "/" + today.getDate() + "/" + today.getFullYear();
        printPDF(headerData, bodyData, footerData, sampleData, false).then(html => {
          fs.writeFileSync($settings.systemdir + "/doc.html", html);
          $$invalidate(1, previewModalOpen = false);
          shell.openItem($settings.systemdir + "/doc.html");
        }).catch(e => {
          console.log(e);
          $$invalidate(1, previewModalOpen = false);
          $$invalidate(2, docErrorModalOpen = true);
        });
      }; // let saveHeader = (e)=> {
      //     fs.writeFileSync(root + '/accommodateData/header.accom', e.detail)
      //     headerData = e.detail
      // }


      let saveBody = e => {
        fs.writeFileSync($settings.systemdir + "/body.accom", e.detail);
        $$invalidate(4, bodyData = e.detail);
        $$invalidate(3, savedModalOpen = true);
      };

      const forceClose_handler = () => {
        $$invalidate(0, pdfBodyModalOpen = false);
      };

      const forceClose_handler_1 = () => {
        $$invalidate(1, previewModalOpen = false);
      };

      const click_handler = () => {
        $$invalidate(3, savedModalOpen = false);
      };

      const forceClose_handler_2 = () => {
        $$invalidate(3, savedModalOpen = false);
      };

      const click_handler_1 = () => {
        $$invalidate(2, docErrorModalOpen = false);
      };

      const forceClose_handler_3 = () => {
        $$invalidate(2, docErrorModalOpen = false);
      };

      return [pdfBodyModalOpen, previewModalOpen, docErrorModalOpen, savedModalOpen, bodyData, $settings, preview, saveBody, forceClose_handler, forceClose_handler_1, click_handler, forceClose_handler_2, click_handler_1, forceClose_handler_3];
    }

    class LOATemplate extends SvelteComponent {
      constructor(options) {
        super();
        init(this, options, instance$d, create_fragment$d, safe_not_equal, {});
      }

    }

    /* src\App.svelte generated by Svelte v3.38.3 */

    function create_if_block_1$6(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot_1$5]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler*/
      ctx[12]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty &
          /*$$scope, showAuthModal*/
          524289) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (211:4) <Modal on:forceClose={()=>{ showAuthModal = false }}>


    function create_default_slot_1$5(ctx) {
      let h3;
      let t1;
      let p;
      let t3;
      let button;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          h3.textContent = "Unauthorized";
          t1 = space();
          p = element("p");
          p.textContent = "You are not authorized to view this content based on the password you provided.";
          t3 = space();
          button = element("button");
          button.textContent = "OK";
          attr(button, "class", "centered blue");
          attr(button, "type", "submit");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          insert(target, t1, anchor);
          insert(target, p, anchor);
          insert(target, t3, anchor);
          insert(target, button, anchor);

          if (!mounted) {
            dispose = listen(button, "click", prevent_default(
            /*click_handler*/
            ctx[11]));
            mounted = true;
          }
        },

        p: noop,

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t1);
          if (detaching) detach(p);
          if (detaching) detach(t3);
          if (detaching) detach(button);
          mounted = false;
          dispose();
        }

      };
    } // (218:0) {#if showPassModal}


    function create_if_block$8(ctx) {
      let modal;
      let current;
      modal = new Modal({
        props: {
          $$slots: {
            default: [create_default_slot$6]
          },
          $$scope: {
            ctx
          }
        }
      });
      modal.$on("forceClose",
      /*forceClose_handler_1*/
      ctx[16]);
      return {
        c() {
          create_component(modal.$$.fragment);
        },

        m(target, anchor) {
          mount_component(modal, target, anchor);
          current = true;
        },

        p(ctx, dirty) {
          const modal_changes = {};

          if (dirty &
          /*$$scope, showPassModal, pageBuffer, curPassword*/
          524302) {
            modal_changes.$$scope = {
              dirty,
              ctx
            };
          }

          modal.$set(modal_changes);
        },

        i(local) {
          if (current) return;
          transition_in(modal.$$.fragment, local);
          current = true;
        },

        o(local) {
          transition_out(modal.$$.fragment, local);
          current = false;
        },

        d(detaching) {
          destroy_component(modal, detaching);
        }

      };
    } // (219:4) <Modal on:forceClose={()=>{ showPassModal = false }}>


    function create_default_slot$6(ctx) {
      let h3;
      let t1;
      let p;
      let t3;
      let div;
      let input;
      let br;
      let t4;
      let button0;
      let t6;
      let button1;
      let mounted;
      let dispose;
      return {
        c() {
          h3 = element("h3");
          h3.textContent = "Password";
          t1 = space();
          p = element("p");
          p.textContent = "Enter a password to view this content.";
          t3 = space();
          div = element("div");
          input = element("input");
          br = element("br");
          t4 = space();
          button0 = element("button");
          button0.textContent = "OK";
          t6 = space();
          button1 = element("button");
          button1.textContent = "Cancel";
          attr(input, "type", "password");
          attr(button0, "class", "blue");
          attr(button0, "type", "submit");
          attr(button1, "type", "submit");
          attr(div, "class", "inline centered");
        },

        m(target, anchor) {
          insert(target, h3, anchor);
          insert(target, t1, anchor);
          insert(target, p, anchor);
          insert(target, t3, anchor);
          insert(target, div, anchor);
          append(div, input);
          set_input_value(input,
          /*curPassword*/
          ctx[2]);
          append(div, br);
          append(div, t4);
          append(div, button0);
          append(div, t6);
          append(div, button1);

          if (!mounted) {
            dispose = [listen(input, "input",
            /*input_input_handler*/
            ctx[13]), listen(button0, "click", prevent_default(
            /*click_handler_1*/
            ctx[14])), listen(button1, "click", prevent_default(
            /*click_handler_2*/
            ctx[15]))];
            mounted = true;
          }
        },

        p(ctx, dirty) {
          if (dirty &
          /*curPassword*/
          4 && input.value !==
          /*curPassword*/
          ctx[2]) {
            set_input_value(input,
            /*curPassword*/
            ctx[2]);
          }
        },

        d(detaching) {
          if (detaching) detach(h3);
          if (detaching) detach(t1);
          if (detaching) detach(p);
          if (detaching) detach(t3);
          if (detaching) detach(div);
          mounted = false;
          run_all(dispose);
        }

      };
    }

    function create_fragment$e(ctx) {
      let section;
      let div0;
      let t2;
      let nav;
      let svg1;
      let g;
      let path1;
      let t3;
      let ul;
      let li0;
      let a0;
      let t4;
      let t5_value = formatText(
      /*$settings*/
      ctx[6].abbrev, false, false, true) + "";
      let t5;
      let t6;
      let li1;
      let a1;
      let t7_value = formatText(
      /*$settings*/
      ctx[6].students, true, true) + "";
      let t7;
      let t8;
      let li2;
      let a2;
      let t9_value = formatText(
      /*$settings*/
      ctx[6].services, true, true) + "";
      let t9;
      let t10;
      let li3;
      let a3;
      let t11_value = formatText(
      /*$settings*/
      ctx[6].abbrev, false, false, true) + "";
      let t11;
      let t12;
      let t13;
      let li4;
      let t15;
      let div2;
      let div1;
      let switch_instance;
      let t16;
      let t17;
      let if_block1_anchor;
      let current;
      var switch_value =
      /*page*/
      ctx[7][
      /*curPage*/
      ctx[5]];

      function switch_props(ctx) {
        return {};
      }

      if (switch_value) {
        switch_instance = new switch_value(switch_props());
        switch_instance.$on("scrollUp",
        /*scrollUp_handler*/
        ctx[9]);
      }

      let if_block0 =
      /*showAuthModal*/
      ctx[0] && create_if_block_1$6(ctx);
      let if_block1 =
      /*showPassModal*/
      ctx[1] && create_if_block$8(ctx);
      return {
        c() {
          section = element("section");
          div0 = element("div");
          div0.innerHTML = `<svg id="logo" version="1.1" xmlns="http://www.w3.org/2000/svg" width="174" height="200" viewBox="0 0 173.20508075688772 200" style="filter: drop-shadow(rgba(255, 255, 255, 0.5) 0px 0px 10px);" class="svelte-vwhysm"><path fill="#C33C54" d="M86.60254037844386 0L173.20508075688772 50L173.20508075688772 150L86.60254037844386 200L0 150L0 50Z"></path></svg> 
        <h1 class="svelte-vwhysm">Accommodate</h1>`;
          t2 = space();
          nav = element("nav");
          svg1 = svg_element("svg");
          g = svg_element("g");
          path1 = svg_element("path");
          t3 = space();
          ul = element("ul");
          li0 = element("li");
          a0 = element("a");
          t4 = text("Write ");
          t5 = text(t5_value);
          t6 = space();
          li1 = element("li");
          a1 = element("a");
          t7 = text(t7_value);
          t8 = space();
          li2 = element("li");
          a2 = element("a");
          t9 = text(t9_value);
          t10 = space();
          li3 = element("li");
          a3 = element("a");
          t11 = text(t11_value);
          t12 = text(" Template");
          t13 = space();
          li4 = element("li");
          li4.innerHTML = `<a href="#settings" class="svelte-vwhysm">Settings</a>`;
          t15 = space();
          div2 = element("div");
          div1 = element("div");
          if (switch_instance) create_component(switch_instance.$$.fragment);
          t16 = space();
          if (if_block0) if_block0.c();
          t17 = space();
          if (if_block1) if_block1.c();
          if_block1_anchor = empty();
          attr(div0, "id", "header");
          attr(div0, "class", "svelte-vwhysm");
          attr(path1, "d", "M 0,247 H 200 C 87.745309,251.08461 12.341004,241.11661 0,297 Z");
          set_style(path1, "opacity", "1");
          set_style(path1, "fill", "#6adfee");
          set_style(path1, "fill-opacity", "1");
          set_style(path1, "stroke", "none");
          set_style(path1, "stroke-width", "0.26499999");
          set_style(path1, "stroke-miterlimit", "4");
          set_style(path1, "stroke-dasharray", "none");
          set_style(path1, "stroke-opacity", "1");
          attr(g, "transform", "translate(0,-247)");
          attr(svg1, "id", "menucurl");
          attr(svg1, "viewBox", "0 0 200 50");
          attr(svg1, "class", "svelte-vwhysm");
          attr(a0, "href", "#write");
          attr(a0, "class", "svelte-vwhysm");
          attr(li0, "class", "svelte-vwhysm");
          toggle_class(li0, "active",
          /*curPage*/
          ctx[5] == "#write");
          attr(a1, "href", "#students");
          attr(a1, "class", "svelte-vwhysm");
          attr(li1, "class", "svelte-vwhysm");
          toggle_class(li1, "active",
          /*curPage*/
          ctx[5] == "#students" ||
          /*curPage*/
          ctx[5] == "#record");
          attr(a2, "href", "#accommodations");
          attr(a2, "class", "svelte-vwhysm");
          attr(li2, "class", "svelte-vwhysm");
          toggle_class(li2, "active",
          /*curPage*/
          ctx[5] == "#accommodations");
          attr(a3, "href", "#pdf");
          attr(a3, "class", "svelte-vwhysm");
          attr(li3, "class", "svelte-vwhysm");
          toggle_class(li3, "active",
          /*curPage*/
          ctx[5] == "#pdf");
          attr(li4, "class", "svelte-vwhysm");
          toggle_class(li4, "active",
          /*curPage*/
          ctx[5] == "#settings");
          attr(ul, "class", "svelte-vwhysm");
          attr(nav, "class", "svelte-vwhysm");
          attr(div1, "class", "constrain svelte-vwhysm");
          attr(div2, "class", "inner svelte-vwhysm");
          attr(section, "id", "main");
          attr(section, "class", "svelte-vwhysm");
        },

        m(target, anchor) {
          insert(target, section, anchor);
          append(section, div0);
          append(section, t2);
          append(section, nav);
          append(nav, svg1);
          append(svg1, g);
          append(g, path1);
          append(nav, t3);
          append(nav, ul);
          append(ul, li0);
          append(li0, a0);
          append(a0, t4);
          append(a0, t5);
          append(ul, t6);
          append(ul, li1);
          append(li1, a1);
          append(a1, t7);
          append(ul, t8);
          append(ul, li2);
          append(li2, a2);
          append(a2, t9);
          append(ul, t10);
          append(ul, li3);
          append(li3, a3);
          append(a3, t11);
          append(a3, t12);
          append(ul, t13);
          append(ul, li4);
          append(section, t15);
          append(section, div2);
          append(div2, div1);

          if (switch_instance) {
            mount_component(switch_instance, div1, null);
          }
          /*div2_binding*/


          ctx[10](div2);
          insert(target, t16, anchor);
          if (if_block0) if_block0.m(target, anchor);
          insert(target, t17, anchor);
          if (if_block1) if_block1.m(target, anchor);
          insert(target, if_block1_anchor, anchor);
          current = true;
        },

        p(ctx, [dirty]) {
          if ((!current || dirty &
          /*$settings*/
          64) && t5_value !== (t5_value = formatText(
          /*$settings*/
          ctx[6].abbrev, false, false, true) + "")) set_data(t5, t5_value);

          if (dirty &
          /*curPage*/
          32) {
            toggle_class(li0, "active",
            /*curPage*/
            ctx[5] == "#write");
          }

          if ((!current || dirty &
          /*$settings*/
          64) && t7_value !== (t7_value = formatText(
          /*$settings*/
          ctx[6].students, true, true) + "")) set_data(t7, t7_value);

          if (dirty &
          /*curPage*/
          32) {
            toggle_class(li1, "active",
            /*curPage*/
            ctx[5] == "#students" ||
            /*curPage*/
            ctx[5] == "#record");
          }

          if ((!current || dirty &
          /*$settings*/
          64) && t9_value !== (t9_value = formatText(
          /*$settings*/
          ctx[6].services, true, true) + "")) set_data(t9, t9_value);

          if (dirty &
          /*curPage*/
          32) {
            toggle_class(li2, "active",
            /*curPage*/
            ctx[5] == "#accommodations");
          }

          if ((!current || dirty &
          /*$settings*/
          64) && t11_value !== (t11_value = formatText(
          /*$settings*/
          ctx[6].abbrev, false, false, true) + "")) set_data(t11, t11_value);

          if (dirty &
          /*curPage*/
          32) {
            toggle_class(li3, "active",
            /*curPage*/
            ctx[5] == "#pdf");
          }

          if (dirty &
          /*curPage*/
          32) {
            toggle_class(li4, "active",
            /*curPage*/
            ctx[5] == "#settings");
          }

          if (switch_value !== (switch_value =
          /*page*/
          ctx[7][
          /*curPage*/
          ctx[5]])) {
            if (switch_instance) {
              group_outros();
              const old_component = switch_instance;
              transition_out(old_component.$$.fragment, 1, 0, () => {
                destroy_component(old_component, 1);
              });
              check_outros();
            }

            if (switch_value) {
              switch_instance = new switch_value(switch_props());
              switch_instance.$on("scrollUp",
              /*scrollUp_handler*/
              ctx[9]);
              create_component(switch_instance.$$.fragment);
              transition_in(switch_instance.$$.fragment, 1);
              mount_component(switch_instance, div1, null);
            } else {
              switch_instance = null;
            }
          }

          if (
          /*showAuthModal*/
          ctx[0]) {
            if (if_block0) {
              if_block0.p(ctx, dirty);

              if (dirty &
              /*showAuthModal*/
              1) {
                transition_in(if_block0, 1);
              }
            } else {
              if_block0 = create_if_block_1$6(ctx);
              if_block0.c();
              transition_in(if_block0, 1);
              if_block0.m(t17.parentNode, t17);
            }
          } else if (if_block0) {
            group_outros();
            transition_out(if_block0, 1, 1, () => {
              if_block0 = null;
            });
            check_outros();
          }

          if (
          /*showPassModal*/
          ctx[1]) {
            if (if_block1) {
              if_block1.p(ctx, dirty);

              if (dirty &
              /*showPassModal*/
              2) {
                transition_in(if_block1, 1);
              }
            } else {
              if_block1 = create_if_block$8(ctx);
              if_block1.c();
              transition_in(if_block1, 1);
              if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
            }
          } else if (if_block1) {
            group_outros();
            transition_out(if_block1, 1, 1, () => {
              if_block1 = null;
            });
            check_outros();
          }
        },

        i(local) {
          if (current) return;
          if (switch_instance) transition_in(switch_instance.$$.fragment, local);
          transition_in(if_block0);
          transition_in(if_block1);
          current = true;
        },

        o(local) {
          if (switch_instance) transition_out(switch_instance.$$.fragment, local);
          transition_out(if_block0);
          transition_out(if_block1);
          current = false;
        },

        d(detaching) {
          if (detaching) detach(section);
          if (switch_instance) destroy_component(switch_instance);
          /*div2_binding*/

          ctx[10](null);
          if (detaching) detach(t16);
          if (if_block0) if_block0.d(detaching);
          if (detaching) detach(t17);
          if (if_block1) if_block1.d(detaching);
          if (detaching) detach(if_block1_anchor);
        }

      };
    }

    function instance$e($$self, $$props, $$invalidate) {
      let $settings;
      component_subscribe($$self, settings, $$value => $$invalidate(6, $settings = $$value));
      let showAuthModal = false;
      let showPassModal = false;
      let curPassword = "";
      let pagePasswords = "";
      let pageBuffer = "";
      let page = {
        "#write": Write,
        "#students": Students,
        "#accommodations": Accommodations,
        "#record": Record,
        "#settings": Settings,
        "#pdf": LOATemplate
      };
      let viewarea;
      let curPage = "";

      let checkForPagePassword = page => {
        let pwords = [];

        if ($settings.passwords && Array.isArray($settings.passwords)) {
          $settings.passwords.forEach(pw => {
            if (pw) {
              pw.pages.forEach(p => {
                if (p.value == page) pwords.push(pw.password);
              });
            }
          });
        }

        return pwords;
      };

      let changePage = (page, prompt = true) => {
        pagePasswords = checkForPagePassword(page);
        $$invalidate(1, showPassModal = false); //Check if the page is included in any password pages list

        if (pagePasswords.length > 0) {
          if (curPassword && pagePasswords.includes(curPassword)) $$invalidate(5, curPage = page);else if (prompt) {
            $$invalidate(1, showPassModal = true);
            $$invalidate(3, pageBuffer = page);
          } else {
            $$invalidate(0, showAuthModal = true);
            window.location.hash = "";
          }
        } else $$invalidate(5, curPage = page);
      };

      window.onhashchange = () => {
        changePage(window.location.hash.split("/")[0]);
      };

      onMount(() => {
        window.location.hash = "#";
        setTimeout(() => {
          window.location.hash = "#write";
        }, 300);
        changePage("#write");
      });

      const scrollUp_handler = () => {
        $$invalidate(4, viewarea.scrollTop = 0, viewarea);
      };

      function div2_binding($$value) {
        binding_callbacks[$$value ? "unshift" : "push"](() => {
          viewarea = $$value;
          $$invalidate(4, viewarea);
        });
      }

      const click_handler = () => {
        $$invalidate(0, showAuthModal = false);
      };

      const forceClose_handler = () => {
        $$invalidate(0, showAuthModal = false);
      };

      function input_input_handler() {
        curPassword = this.value;
        $$invalidate(2, curPassword);
      }

      const click_handler_1 = () => {
        changePage(pageBuffer, false);
      };

      const click_handler_2 = () => {
        $$invalidate(1, showPassModal = false);
      };

      const forceClose_handler_1 = () => {
        $$invalidate(1, showPassModal = false);
      };

      return [showAuthModal, showPassModal, curPassword, pageBuffer, viewarea, curPage, $settings, page, changePage, scrollUp_handler, div2_binding, click_handler, forceClose_handler, input_input_handler, click_handler_1, click_handler_2, forceClose_handler_1];
    }

    class App extends SvelteComponent {
      constructor(options) {
        super();
        init(this, options, instance$e, create_fragment$e, safe_not_equal, {});
      }

    }

    const app$2 = new App({
      target: document.body
    });

    return app$2;

}());
//# sourceMappingURL=bundle.js.map
