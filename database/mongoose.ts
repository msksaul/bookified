import mongoose from 'mongoose'

const MONDODB_URI = process.env.MONGODB_URI

if (!MONDODB_URI) throw new Error('Please define the MONDODB_URI environment variable')

declare global{
  var mongooseCache: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  }
}

const cached = global.mongooseCache || (global.mongooseCache = { conn: null, promise: null })

export const connectToDatabase = async () => {
  if (cached.conn) return cached.conn

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONDODB_URI, { bufferCommands: false})
  }

  try {
    cached.conn = await cached.promise
  } catch (error) {
    cached.promise = null
    console.error('MongoDb coneectior error. Please make sure MongoDB is running. ' + error)
    throw error
  }

  console.log('Connected to MongoDB')
  return cached.conn
}