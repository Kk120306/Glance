import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

/**
 * POST /api/messages/upload — accept a photo/video file from a caregiver and
 * return a URL the message compose form can attach.
 *
 * Caregivers attach media by file (not by pasting an external link). The file is
 * validated by MIME type and size, written under `public/uploads`, and served
 * statically. The returned absolute URL is stored on the message's `mediaUrl`,
 * so the patient device (a different origin) can load it directly.
 *
 * NOTE: local-disk storage suits dev / single-node. A multi-node or serverless
 * deploy should swap the write below for object storage (S3/R2/GCS) and return
 * the object URL — the response contract ({ url, mediaType }) stays the same.
 */

const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

// Allowed upload types → file extension. Anything else is rejected.
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is too large (max 25 MB)' }, { status: 413 })
  }

  const ext = EXTENSION_BY_MIME[file.type]
  if (!ext) {
    return NextResponse.json(
      { error: 'Unsupported file type — use JPG, PNG, GIF, WebP, MP4, WebM, or MOV' },
      { status: 415 },
    )
  }
  const mediaType: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image'

  const buffer = Buffer.from(await file.arrayBuffer())
  const fileName = `${randomUUID()}.${ext}`
  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  try {
    await mkdir(uploadDir, { recursive: true })
    await writeFile(path.join(uploadDir, fileName), buffer)
  } catch (err) {
    console.error('[upload] failed to write file:', err)
    return NextResponse.json({ error: 'Failed to store file' }, { status: 500 })
  }

  // Absolute URL so the patient device (a different origin) can load it directly.
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  return NextResponse.json({ url: `${origin}/uploads/${fileName}`, mediaType })
}
