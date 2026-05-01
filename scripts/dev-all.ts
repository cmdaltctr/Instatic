interface DevProcess {
  name: string
  command: string
  env?: Record<string, string>
}

const processes: DevProcess[] = [
  {
    name: 'cms',
    command: 'bun run dev:server',
    env: {
      PORT: process.env.PORT ?? '3001',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://page_builder:page_builder@127.0.0.1:5433/page_builder',
      STATIC_DIR: process.env.STATIC_DIR ?? './dist',
      UPLOADS_DIR: process.env.UPLOADS_DIR ?? './uploads',
    },
  },
  {
    name: 'vite',
    command: 'bun run dev -- --host 127.0.0.1',
  },
]

const children: Bun.Subprocess[] = []
let shuttingDown = false

function argsFor(command: string) {
  return command.split(' ')
}

function stopChildren(signal: NodeJS.Signals = 'SIGTERM') {
  for (const child of children) {
    if (child.exitCode === null) child.kill(signal)
  }
}

for (const processConfig of processes) {
  const child = Bun.spawn(argsFor(processConfig.command), {
    env: { ...process.env, ...processConfig.env },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })

  children.push(child)
  void child.exited.then((code) => {
    if (shuttingDown) return
    shuttingDown = true
    stopChildren()
    process.exit(code)
  })
}

process.on('SIGINT', () => {
  shuttingDown = true
  stopChildren('SIGINT')
})

process.on('SIGTERM', () => {
  shuttingDown = true
  stopChildren('SIGTERM')
})
