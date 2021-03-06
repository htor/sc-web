import portaudio from 'naudiodon'
import express from 'express'
import sc from 'supercolliderjs'
import wavHeader from 'wav-headers'
import http from 'http'
import path from 'path'
import { exec } from 'child_process'
import fs from 'fs'
import WebSocket from 'ws'

function sleep (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function shell (command) {
  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve({ stdout, stderr })
    })
  })
}

async function boot () {
  const sclang = await sc.lang.boot()
  await sclang.interpret(`
    s.options.device = "JackRouter";
    s.boot;
  `)
  return sclang
}

function capture (device) {
  return new portaudio.AudioIO({
    inOptions: {
      channelCount: 2,
      sampleFormat: portaudio.SampleFormat16Bit,
      sampleRate: 44100,
      deviceId: device.id
    }
  })
}

async function evaluate (sclang, code) {
  let result
  try {
    result = await sclang.interpret(code)
    result = result.string ? result.string : String(result)
  } catch (error) {
    result = error.message
  } finally {
    return result
  }
}

function exit (message) {
  console.log(`${message + ' -' || ''} Exiting...`)
  process.exit(message ? 1 : 0)
}

async function main () {
  const devices = portaudio.getDevices()
  const jack = devices.filter((device) => device.name === 'JackRouter')[0]
  if (!jack) exit('Error: JACK server is not running')
  console.log('Booting SuperCollider server...');
  const sclang = await boot()
  await sleep(1000)
  console.log('Routing audio...');
  const tmp = capture(jack)
  await sleep(2000)
  await shell('jack_lsp | grep node')
  await shell(`jack_disconnect system:capture_1 node:in1`)
  await shell(`jack_disconnect system:capture_2 node:in2`)
  await shell(`jack_disconnect scsynth:out1 system:playback_1`)
  await shell(`jack_disconnect scsynth:out2 system:playback_2`)
  await shell(`jack_connect scsynth:out1 node:in1`)
  await shell(`jack_connect scsynth:out2 node:in2`)
  tmp.quit()
  console.log('Booting web server...');
  const app = express()
  app.use(express.static('.'))
  app.get('/audio', (request, response) => {
    console.log('Streaming audio...')
    const audio = capture(jack)
    audio.on('error', (error) => { response.end(); exit(`Error: ${error}`) })
    audio.start()
    response.on('close', () => audio.quit())
    response.writeHead(200, { 'Content-Type': 'audio/wav' })
    response.write(wavHeader({ channels: 2, bitDepth: 16, sampleRate: 44100 }))
    audio.pipe(response)
  })
  const server = app.listen(8080)
  const wss = new WebSocket.Server({ server })
  wss.on('connection', async (socket) => {
    socket.on('message', async (code) => {
      const result = await evaluate(sclang, code)
      socket.send(result)
    })
  })
  console.log(`Listening on port ${server.address().port}...`);
}

main()
