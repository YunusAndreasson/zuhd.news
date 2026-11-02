// The day's audio briefing on the map's masthead: a play button, a time left
// and a track to seek on, with the lock screen's controls where there are any.

const PLAY = '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><polygon points="3,1 12,7 3,13"/></svg>'
const PAUSE =
  '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="3.5" height="12"/><rect x="8.5" y="1" width="3.5" height="12"/></svg>'
const LABEL = 'Today\u2019s briefing'
const STEP_SECONDS = 15

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function mount(root: HTMLElement, props: { key?: string; date?: string }) {
  const audio = root.querySelector('audio')
  const button = root.querySelector<HTMLElement>('.briefing-play')
  const label = root.querySelector('.briefing-label')
  const track = root.querySelector<HTMLElement>('.briefing-track')
  const bar = root.querySelector<HTMLElement>('.briefing-bar')
  if (!audio || !button || !label || !track || !bar) return

  const key = `briefing-listened-${props.key}`
  const session = 'mediaSession' in navigator ? navigator.mediaSession : null
  const remember = () => {
    try {
      localStorage.setItem(key, '1')
    } catch {}
    root.classList.add('listened')
  }
  try {
    if (localStorage.getItem(key)) root.classList.add('listened')
  } catch {}

  const showPlay = () => {
    button.innerHTML = PLAY
    button.setAttribute('aria-label', 'Play briefing')
  }
  const showPause = () => {
    button.innerHTML = PAUSE
    button.setAttribute('aria-label', 'Pause briefing')
  }
  const syncPosition = () => {
    if (session && audio.duration) {
      session.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: audio.currentTime })
    }
  }
  const seekTo = (seconds: number) => {
    if (!audio.duration) return
    audio.currentTime = Math.min(audio.duration, Math.max(0, seconds))
    syncPosition()
  }
  const play = () => {
    showPause()
    if (session) session.playbackState = 'playing'
    audio.play().catch(() => {
      showPlay()
      if (session) session.playbackState = 'paused'
    })
  }
  const pause = () => {
    audio.pause()
    showPlay()
    label.textContent = LABEL
    if (session) session.playbackState = 'paused'
  }

  root.style.cursor = 'pointer'
  root.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('.briefing-track')) return
    if (audio.paused) play()
    else pause()
  })

  audio.addEventListener('timeupdate', () => {
    const percent = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0
    bar.style.width = `${percent}%`
    track.setAttribute('aria-valuenow', String(Math.round(percent)))
    if (audio.duration) {
      track.setAttribute('aria-valuetext', `${clock(audio.currentTime)} of ${clock(audio.duration)}`)
      if (!audio.paused) label.textContent = clock(audio.duration - audio.currentTime)
    }
    if (audio.currentTime > 10) remember()
    syncPosition()
  })
  audio.addEventListener('ended', () => {
    showPlay()
    bar.style.width = '0'
    track.setAttribute('aria-valuenow', '0')
    label.textContent = LABEL
    remember()
    if (session) session.playbackState = 'none'
  })

  track.addEventListener('click', (e) => seekTo((e.offsetX / track.offsetWidth) * audio.duration))
  track.addEventListener('keydown', (e) => {
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? audio.currentTime + STEP_SECONDS
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? audio.currentTime - STEP_SECONDS
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? audio.duration
              : null
    if (to === null) return
    e.preventDefault()
    seekTo(to)
  })

  if (session) {
    session.metadata = new MediaMetadata({
      title: 'Daily Briefing',
      artist: 'zuhd.news',
      album: props.date ?? '',
      artwork: [
        { src: '/briefing-artwork-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/briefing-artwork.png', sizes: '512x512', type: 'image/png' },
      ],
    })
    session.setActionHandler('play', play)
    session.setActionHandler('pause', pause)
    session.setActionHandler('stop', () => {
      audio.pause()
      audio.currentTime = 0
      showPlay()
      bar.style.width = '0'
      label.textContent = LABEL
      session.playbackState = 'none'
    })
    session.setActionHandler('seekto', (d) => {
      if (d.seekTime == null) return
      if (d.fastSeek && 'fastSeek' in audio) audio.fastSeek(d.seekTime)
      else seekTo(d.seekTime)
      syncPosition()
    })
    session.setActionHandler('seekbackward', (d) => seekTo(audio.currentTime - (d.seekOffset || STEP_SECONDS)))
    session.setActionHandler('seekforward', (d) => seekTo(audio.currentTime + (d.seekOffset || STEP_SECONDS)))
  }
}
