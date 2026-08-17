(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Pacing of the chat playback — tune these to speed up / slow down.
  const PACE = {
    lead: 900,        // beat before the first message arrives
    perChar: 38,      // typing time per character
    typeMin: 900,     // shortest a typing indicator ever shows
    typeMax: 2400,    // longest, so long messages don't stall
    card: 1600,       // typing time before a rich card (date/venue/invite)
    settle: 560       // pause after a message lands, before the next typing
  };

  function fmtTime(date){
    let h = date.getHours();
    const m = String(date.getMinutes()).padStart(2, '0');
    h = h % 12 || 12;
    return `${h}:${m}`;
  }

  // ---- Status bar clock (real local time) ----
  const clockEl = document.querySelector('[data-clock]');
  if (clockEl){
    const tickClock = () => { clockEl.textContent = fmtTime(new Date()); };
    tickClock();
    setInterval(tickClock, 15000);
  }

  // ---- Background music ----
  const bgAudio = document.querySelector('[data-bg-audio]');
  const soundToggle = document.querySelector('[data-sound-toggle]');
  if (bgAudio && soundToggle){
    bgAudio.volume = 0.5;
    const setMusicMuted = (muted) => {
      bgAudio.muted = muted;
      soundToggle.classList.toggle('is-muted', muted);
      soundToggle.setAttribute('aria-label', muted ? 'Play music' : 'Mute music');
      soundToggle.setAttribute('aria-pressed', String(!muted));
    };
    setMusicMuted(false);
    soundToggle.addEventListener('click', () => setMusicMuted(!bgAudio.muted));
  }

  // ---- Pinned countdown ----
  const countdowns = document.querySelectorAll('[data-countdown]');
  const pad = (n) => String(n).padStart(2, '0');
  function tickCountdown(el){
    const target = new Date(el.dataset.countdown).getTime();
    const diff = Math.max(0, target - Date.now());
    el.querySelector('[data-days]').textContent = pad(Math.floor(diff / 86400000));
    el.querySelector('[data-hours]').textContent = pad(Math.floor((diff % 86400000) / 3600000));
    el.querySelector('[data-minutes]').textContent = pad(Math.floor((diff % 3600000) / 60000));
    el.querySelector('[data-seconds]').textContent = pad(Math.floor((diff % 60000) / 1000));
  }
  if (countdowns.length){
    countdowns.forEach(tickCountdown);
    setInterval(() => countdowns.forEach(tickCountdown), 1000);
  }

  // ---- Live message sequence player ----
  const scroll = document.querySelector('[data-scroll]');
  const skipBtn = document.querySelector('[data-skip]');
  const statusEl = document.querySelector('[data-status]');
  const stickerTray = document.querySelector('[data-stickertray]');
  const endNote = document.querySelector('[data-end]');
  const IDLE_STATUS = statusEl ? statusEl.textContent : '';

  if (scroll) scroll.setAttribute('aria-live', 'polite');

  function scrollToBottom(){
    if (!scroll) return;
    scroll.scrollTop = scroll.scrollHeight;
  }

  function setStatus(text){
    if (statusEl) statusEl.textContent = text;
  }

  // Typing rows are appended to the log itself, never inside a message
  // group — nesting one in .bubbles put a second avatar beside the
  // group's own, and rows inside a still-hidden group never showed.
  function makeTypingRow(who){
    const row = document.createElement('div');
    row.className = 'typing-row typing-row--' + who;
    if (who !== 'c'){
      const av = document.createElement('img');
      av.className = 'msg-avatar';
      av.alt = '';
      av.src = who === 'd' ? 'images/avatar-dharani.jpg' : 'images/avatar-vishal.jpg';
      row.appendChild(av);
    }
    const dots = document.createElement('div');
    dots.className = 'typing-dots' + (who === 'v' ? ' typing-dots--v' : '');
    dots.innerHTML = '<span></span><span></span><span></span>';
    row.appendChild(dots);
    return row;
  }

  let skipped = false;
  let waiters = [];
  function wait(ms){
    return new Promise((resolve) => {
      if (skipped){ resolve(); return; }
      const t = setTimeout(resolve, ms);
      waiters.push(() => { clearTimeout(t); resolve(); });
    });
  }
  function doSkip(){
    if (skipped) return;
    skipped = true;
    waiters.forEach((fn) => fn());
    waiters = [];
    if (skipBtn) skipBtn.hidden = true;
  }
  if (skipBtn) skipBtn.addEventListener('click', doSkip);

  function stampTime(bubble, date){
    const meta = document.createElement('span');
    meta.className = 'bubble__meta';
    meta.textContent = fmtTime(date);
    bubble.appendChild(meta);
  }

  async function playSequence(){
    if (!scroll) return;
    const steps = Array.from(scroll.querySelectorAll('[data-seq]'));
    if (!steps.length) return;

    // Times run up to "now", so the newest message reads as just-sent.
    const now = Date.now();
    const startAt = now - Math.ceil(steps.length / 2) * 60000;
    const timeFor = (i) => new Date(startAt + Math.floor(i / 2) * 60000);

    const finish = () => {
      if (skipBtn) skipBtn.hidden = true;
      setStatus(IDLE_STATUS);
      if (stickerTray) stickerTray.hidden = false;
      if (endNote) endNote.hidden = false;
      scrollToBottom();
    };

    if (reduceMotion){
      steps.forEach((el, i) => {
        const group = el.closest('.msg-group');
        if (group) group.classList.remove('seq-pending');
        el.hidden = false;
        const bubbles = el.parentElement;
        if (el.classList.contains('bubble') && el === bubbles.lastElementChild){
          stampTime(el, timeFor(i));
        }
      });
      finish();
      return;
    }

    if (skipBtn) skipBtn.hidden = false;
    await wait(PACE.lead);

    for (let i = 0; i < steps.length; i++){
      const el = steps[i];
      const who = el.dataset.seq;

      if (!skipped){
        const typingEl = makeTypingRow(who);
        scroll.appendChild(typingEl);
        setStatus(who === 'v' ? 'Vishal is typing…' : who === 'd' ? 'Dharani is typing…' : 'typing…');
        scrollToBottom();

        const len = (el.textContent || '').trim().length;
        const dur = who === 'c'
          ? PACE.card
          : Math.min(PACE.typeMax, Math.max(PACE.typeMin, len * PACE.perChar));
        await wait(dur);

        typingEl.remove();
        setStatus(IDLE_STATUS);
      }

      const group = el.closest('.msg-group');
      if (group) group.classList.remove('seq-pending');
      el.hidden = false;

      const bubbles = el.parentElement;
      if (el.classList.contains('bubble') && el === bubbles.lastElementChild){
        stampTime(el, timeFor(i));
      }

      scrollToBottom();
      if (!skipped) await wait(PACE.settle);
    }

    finish();
  }

  // ---- Lock screen -> chat unlock ----
  const phone = document.querySelector('[data-phone]');
  const unlockBtn = document.querySelector('[data-unlock]');
  const lock = document.querySelector('[data-lock]');
  if (phone && lock){
    let opened = false;
    const openChat = () => {
      if (opened) return;
      opened = true;
      phone.classList.add('phone--unlocked');
      if (bgAudio){
        bgAudio.play().catch(() => {});
        soundToggle.hidden = false;
      }
      playSequence();
    };
    if (unlockBtn) unlockBtn.addEventListener('click', openChat);
    lock.addEventListener('click', openChat);
  }

  // ---- Add to calendar (.ics download) ----
  const calBtn = document.querySelector('[data-add-calendar]');
  if (calBtn){
    calBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Vishal and Dharani//Wedding//EN',
        'BEGIN:VEVENT',
        'UID:vishal-dharani-wedding-2026@love.texted',
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
      a.href = url;
      a.download = 'vishal-dharani-wedding.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  }

  // ---- Input bar heart: jump back to the top of the thread ----
  const sendBtn = document.querySelector('.inputbar__send');
  if (sendBtn && scroll){
    sendBtn.addEventListener('click', () => {
      scroll.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

})();
