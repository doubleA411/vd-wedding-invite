(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* =========================================================
     TILT ENGINE
     Gyroscope on phones, pointer on desktop. Both feed a target
     that is eased toward each frame, then written to --tx / --ty.
     ========================================================= */
  let targetX = 0, targetY = 0;
  let curX = 0, curY = 0;
  let tiltAlive = false;

  function loop(){
    curX += (targetX - curX) * 0.08;
    curY += (targetY - curY) * 0.08;
    root.style.setProperty('--tx', curX.toFixed(4));
    root.style.setProperty('--ty', curY.toFixed(4));
    requestAnimationFrame(loop);
  }
  if (!reduceMotion) requestAnimationFrame(loop);

  // ---- pointer (desktop / anything with a cursor) ----
  if (!reduceMotion){
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;   // gyro owns touch devices
      targetX = clamp((e.clientX / window.innerWidth - 0.5) * 2, -1, 1);
      targetY = clamp((e.clientY / window.innerHeight - 0.5) * 2, -1, 1);
      tiltAlive = true;
    }, { passive: true });
  }

  // ---- gyroscope ----
  // The first reading becomes "level", so it works however the phone
  // is being held rather than assuming it is face-up.
  let baseBeta = null, baseGamma = null;
  const RANGE = 26; // degrees of tilt that map to full deflection

  function onOrient(e){
    if (e.beta === null || e.gamma === null) return;
    if (baseBeta === null){ baseBeta = e.beta; baseGamma = e.gamma; return; }
    targetX = clamp((e.gamma - baseGamma) / RANGE, -1, 1);
    targetY = clamp((e.beta - baseBeta) / RANGE, -1, 1);
    tiltAlive = true;
  }

  function startGyro(){
    if (reduceMotion) return;
    window.addEventListener('deviceorientation', onOrient, { passive: true });
  }

  // iOS 13+ needs an explicit grant, and only from inside a user gesture.
  const DOE = window.DeviceOrientationEvent;
  const needsGrant = !!(DOE && typeof DOE.requestPermission === 'function');

  let askedGyro = false;
  function requestGyro(){
    if (askedGyro || reduceMotion) return;
    askedGyro = true;
    if (!needsGrant){ startGyro(); return; }
    DOE.requestPermission()
      .then((state) => { if (state === 'granted') startGyro(); })
      .catch(() => {});
  }

  // Where no grant is needed, tilt is live immediately so the closed card
  // already responds. iOS is asked from the seal's pointerdown instead.
  if (!needsGrant) requestGyro();

  // If tilt never comes alive on a touch device, stop advertising it and offer
  // an explicit opt-in — motion access can also be switched off in iOS
  // Settings, where no amount of asking from the page will help.
  const tiltBtn = document.querySelector('[data-tilt-enable]');
  const hintSub = document.querySelector('[data-hint-sub]');
  const isTouch = matchMedia('(hover: none)').matches;
  if (isTouch && !reduceMotion){
    setTimeout(() => {
      if (tiltAlive) return;
      if (hintSub) hintSub.textContent = 'press it to open';
      if (tiltBtn){
        tiltBtn.hidden = false;
        tiltBtn.addEventListener('click', () => {
          askedGyro = false;              // allow a fresh prompt
          requestGyro();
          tiltBtn.hidden = true;
          setTimeout(() => {
            if (tiltAlive && hintSub) hintSub.textContent = 'tilt your phone — it moves';
          }, 900);
        });
      }
    }, 2200);
  }

  // Recentre the neutral position if the phone is set down differently
  window.addEventListener('orientationchange', () => { baseBeta = null; baseGamma = null; });

  /* =========================================================
     MUSIC
     ========================================================= */
  const bgAudio = document.querySelector('[data-bg-audio]');
  const soundToggle = document.querySelector('[data-sound-toggle]');
  if (bgAudio && soundToggle){
    bgAudio.volume = 0.5;
    const setMuted = (m) => {
      bgAudio.muted = m;
      soundToggle.classList.toggle('is-muted', m);
      soundToggle.setAttribute('aria-label', m ? 'Play music' : 'Mute music');
      soundToggle.setAttribute('aria-pressed', String(!m));
    };
    setMuted(false);
    soundToggle.addEventListener('click', () => setMuted(!bgAudio.muted));
  }

  /* =========================================================
     THE SEAL → UNFOLD
     ========================================================= */
  const card = document.querySelector('[data-card]');
  const seal = document.querySelector('[data-seal]');
  const burst = document.querySelector('[data-burst]');
  const hint = document.querySelector('[data-hint]');
  const after = document.querySelector('[data-after]');
  let broken = false;

  function sparks(){
    if (!burst || reduceMotion) return;
    for (let i = 0; i < 22; i++){
      const s = document.createElement('i');
      const a = Math.random() * Math.PI * 2;
      const d = 40 + Math.random() * 85;
      s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      s.style.setProperty('--dy', `${Math.sin(a) * d + 18}px`);
      s.style.animationDelay = `${Math.random() * 90}ms`;
      burst.appendChild(s);
    }
    setTimeout(() => { burst.innerHTML = ''; }, 1400);
  }

  function open(){
    if (broken) return;
    broken = true;

    seal.style.transform = '';
    seal.classList.remove('is-dragging', 'is-cracking');
    seal.classList.add('is-broken');
    sparks();
    requestGyro();   // iOS grants motion access here, inside the gesture

    if (bgAudio){
      bgAudio.play().catch(() => {});
      soundToggle.hidden = false;
    }

    // seal falls away, then the gatefold swings open
    setTimeout(() => card.classList.add('is-unfolded'), 380);
    if (hint) hint.classList.add('is-gone');

    // release the page once the card has finished opening
    setTimeout(() => {
      document.body.classList.add('is-open');
      if (after) after.hidden = false;
      observeReveals();
    }, reduceMotion ? 0 : 2000);
  }

  if (seal){
    const CRACK_AT = 12;   // px of movement before the crack shows
    const BREAK_AT = 46;   // px that breaks it
    let dragging = false, sx = 0, sy = 0, moved = 0;

    // Opening must not hinge on any single event. A press opens via pointerup
    // when it arrives, and via this timer when it doesn't (a lifted finger
    // outside the element, or a gesture the browser hands off elsewhere).
    // Starting to drag cancels the timer so the pull can play out.
    let pressTimer = null;
    const clearPress = () => { clearTimeout(pressTimer); pressTimer = null; };

    // move/up live on window, not the seal, for the same reason.
    seal.addEventListener('pointerdown', (e) => {
      if (broken) return;
      // Must be called synchronously here: iOS only grants motion access from
      // inside a real user gesture, and open() often runs from the press timer
      // below, where the request would be rejected. The timer means the card
      // still opens even if the permission dialog eats the rest of the tap.
      requestGyro();
      dragging = true; moved = 0;
      sx = e.clientX; sy = e.clientY;
      seal.classList.add('is-dragging');
      clearPress();
      pressTimer = setTimeout(() => { if (!broken) open(); }, 260);
    });

    window.addEventListener('pointermove', (e) => {
      if (!dragging || broken) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      moved = Math.hypot(dx, dy);
      if (moved > CRACK_AT){
        seal.classList.add('is-cracking');
        clearPress();                 // they're pulling, let the drag decide
      }
      seal.style.transform =
        `translate3d(${dx * 0.6}px, ${dy * 0.6}px, 34px) rotate(${dx * 0.08}deg)`;
      if (moved > BREAK_AT){ dragging = false; clearPress(); open(); }
    }, { passive: true });

    function endDrag(){
      if (!dragging || broken) return;
      dragging = false;
      clearPress();
      // barely moved? that was a press, and a press opens it
      if (moved <= CRACK_AT){ open(); return; }
      seal.classList.remove('is-dragging', 'is-cracking');
      seal.style.transform = '';
    }
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    seal.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); }
    });

    if (reduceMotion) open();
  }

  /* =========================================================
     COUNTDOWN
     ========================================================= */
  const clocks = document.querySelectorAll('[data-countdown]');
  const pad = (n) => String(n).padStart(2, '0');
  function tick(el){
    const t = new Date(el.dataset.countdown).getTime();
    const d = Math.max(0, t - Date.now());
    el.querySelector('[data-days]').textContent = pad(Math.floor(d / 86400000));
    el.querySelector('[data-hours]').textContent = pad(Math.floor((d % 86400000) / 3600000));
    el.querySelector('[data-minutes]').textContent = pad(Math.floor((d % 3600000) / 60000));
    el.querySelector('[data-seconds]').textContent = pad(Math.floor((d % 60000) / 1000));
  }
  if (clocks.length){
    clocks.forEach(tick);
    setInterval(() => clocks.forEach(tick), 1000);
  }

  /* =========================================================
     SCROLL REVEALS (wired up once the card is open)
     ========================================================= */
  function observeReveals(){
    const els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)){
      els.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting){ en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => io.observe(el));
  }

  /* =========================================================
     ADD TO CALENDAR
     ========================================================= */
  const calBtn = document.querySelector('[data-add-calendar]');
  if (calBtn){
    calBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Vishal and Dharani//Wedding//EN',
        'BEGIN:VEVENT',
        'UID:vishal-dharani-wedding-2026@unfolding',
        'DTSTAMP:20260817T000000Z',
        'DTSTART:20260830T020000Z',
        'DTEND:20260830T033000Z',
        'SUMMARY:Vishal & Dharani\'s Wedding',
        'DESCRIPTION:Reception Sat 29 Aug 7 PM. Wedding Sun 30 Aug 7:30-9:00 AM at Sree Varaaham A/C Mahal.',
        'LOCATION:Sree Varaaham A/C Mahal\\, 231 Jawaharlal Nehru Salai\\, Koyambedu\\, Chennai\\, TN 600107',
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');
      const blob = new Blob([ics], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'vishal-dharani-wedding.ics';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  }

})();
