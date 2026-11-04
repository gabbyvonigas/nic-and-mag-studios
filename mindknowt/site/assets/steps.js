/*
 * The three step tiles play once when they scroll into view.
 *
 * All this file does is add a class. Every duration, delay and easing is in
 * the stylesheet, so the motion can be read and changed in one place and this
 * stays a trigger rather than a second description of the animation.
 */
(function () {
  'use strict';

  var steps = document.querySelectorAll('.steps .step');
  if (!steps.length) return;

  /* The press after the Stick tag lands: 320ms of drop, then squash and
     release. Kept here rather than as a keyframe so it is still a transition,
     which is what survives being interrupted. */
  var DROP_MS = 320;
  var PRESS_MS = 160;

  function stagger(step) {
    return parseInt(step.style.getPropertyValue('--step-i'), 10) * 60 || 0;
  }

  function play(step) {
    step.classList.add('is-in');
    if (!step.classList.contains('step-stick')) return;
    step._pressTimers = (step._pressTimers || []).filter(function (t) {
      clearTimeout(t);
      return false;
    });
    step._pressTimers.push(setTimeout(function () {
      step.classList.add('is-pressed');
      step._pressTimers.push(setTimeout(function () {
        step.classList.remove('is-pressed');
      }, PRESS_MS));
    }, stagger(step) + DROP_MS));
  }

  /*
   * No IntersectionObserver means no way to know when the tiles are on
   * screen, so the finished state is shown rather than an empty tile.
   */
  if (!('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(steps, function (s) { s.classList.add('is-in'); });
    return;
  }

  var io = new IntersectionObserver(function (entries, obs) {
    var hit = false;
    entries.forEach(function (e) { if (e.isIntersecting) hit = true; });
    if (!hit) return;
    obs.disconnect();
    Array.prototype.forEach.call(steps, play);
  }, { threshold: 0.3 });

  io.observe(steps[0].parentNode);

  /*
   * Replay on hover, on a pointer that can actually hover. A touch screen
   * reports a hover on tap, which would replay the tile under a finger that
   * was only scrolling past it.
   */
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (!fine.matches) return;

  Array.prototype.forEach.call(steps, function (step) {
    step.addEventListener('mouseenter', function () {
      if (!step.classList.contains('is-in')) return;
      step.classList.remove('is-in', 'is-pressed');
      /* Read a layout value so the removal is committed before the class goes
         back on, otherwise the two changes coalesce and nothing moves. */
      void step.offsetWidth;
      play(step);
    });
  });
}());
