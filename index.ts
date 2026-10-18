import { generateText } from 'ai'

async function main() {
  const { text } = await generateText({
    model: 'moonshotai/kimi-k3',
    prompt: 'Invent a new holiday and describe its traditions.',
  })

  if (!text.trim()) throw new Error('The model returned an empty response.')
  process.stdout.write(`${text.trim()}\n`)
}

main().catch(() => {
  console.error('The AI Gateway example failed. Check the connected Gateway authentication and retry.')
  process.exitCode = 1
})
