import prisma from '#start/prisma'

type scanArgs = {
  pathId: number
  pathContent: string
  directoryFormat: number
  include: string
  exclude: string
}

async function handle({ pathId, pathContent, directoryFormat, include, exclude }: scanArgs) {
  const path = await prisma.path.findUnique({ where: { pathId } })
}
