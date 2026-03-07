'use server'

import BookSegment from '@/database/models/book-segment.model';
import Book from '@/database/models/book.model';
import { connectToDatabase } from '@/database/mongoose';
import { CreateBook, TextSegment } from '@/types';
import { generateSlug, serializeData } from '../utils';

export const checkBookExists = async (title: string) => {
  try {
    await connectToDatabase()

    const slug = generateSlug(title)

    const existingBook = await Book.findOne({ slug }).lean()

    if (existingBook) {
      return {
        exists: true,
        book: serializeData(existingBook)
      }
    }

    return {
      exists: false
    }
  } catch (error) {
    console.error('Error checking if book exists:', error)
    return {
      exists: false,
      error
    }
  }
}

export const createBook = async (data: CreateBook) => {
  try {
    await connectToDatabase()

    const slug = generateSlug(data.title)

    const existingBook = await Book.findOne({ slug }).lean()

    if (existingBook) {
      return {
        success: true,
        data: serializeData(existingBook),
        alreadyExists: true
      }
    }

    const book = await Book.create({ ...data, slug, totalSegments: 0 })

    return {
      success: true,
      data: serializeData(book)
    }
  } catch (error) {
    console.error('Error creating a book:', error);
    return {
      success: false,
      error
    }
  }
}

export const saveBookSegments = async (bookId: string, clerkId: string, segments: TextSegment[]) => {
  try {
    await connectToDatabase()

    console.log('Saving book segments...')

    const segmentsToInsert = segments.map(({ text, segmentIndex, pageNumber, wordCount }) => ({
      clerkId, bookId, content: text, segmentIndex, pageNumber, wordCount
    }))

    await BookSegment.insertMany(segmentsToInsert)

    await Book.findByIdAndUpdate(bookId, { totalSegments: segments.length })

    console.log('Book segments saved successfully')

    return {
      success: true,
      data: { segmentsCreated: segments.length }
    }
  } catch (error) {
    console.error('Error saving book segments:', error)

    await BookSegment.deleteMany({ bookId })
    await Book.findByIdAndDelete(bookId)
    console.log('Deleted book segments and cook due to failure to save segments')

    return {
      success: false,
      error
    }
  }
}