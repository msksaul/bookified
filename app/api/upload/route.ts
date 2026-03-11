import { MAX_FILE_SIZE } from '@/lib/constants';
import { auth } from '@clerk/nextjs/server';
import { handleUpload, HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  
  try {
    const body = (await request.json()) as HandleUploadBody

    const jsonResponse = await handleUpload( { token: process.env.BLOB_READ_WRITE_TOKEN, body, request, onBeforeGenerateToken: async () => {
      const { userId } = await auth()

      if(!userId) throw new Error('Unauthorized: User not authenticated')

      return {
        allowedContentTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        addRandomSuffix: true,
        maximumSizeInBytes: MAX_FILE_SIZE,
        tokenPayload: JSON.stringify({ userId })
      }
    }, onUploadCompleted: async ({ blob, tokenPayload }) => {
      console.log('File uploaded to blob: ', blob.url)

      const payload = tokenPayload ? JSON.parse(tokenPayload) : null
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const userId = payload?.userId
    }})

    return NextResponse.json(jsonResponse)
  } catch (error) {

    const message = error instanceof Error ? error.message : 'An unknown error ocurred'
    const status = message.includes('Unauthorized') ? 401 : 500
    console.error('Upload error', error)
    const clientMessage = status === 401 ? 'Unauthorized' : 'Upload failed'
    
    return NextResponse.json({ error: clientMessage }, { status })
  }
}