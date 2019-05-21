const audio = document.querySelector('audio')
const input = document.querySelector('#input')
const output = document.querySelector('#output')
const socket = new WebSocket('ws://localhost:8080')

audio.play()

socket.addEventListener('open', (event) => {})
socket.addEventListener('message', (event) => {
  output.value += `-> ${event.data}\n`
})

document.addEventListener('keydown', (event) => {
  if (event.altKey && event.key == 'Enter') {
    socket.send(input.value)
  }
})