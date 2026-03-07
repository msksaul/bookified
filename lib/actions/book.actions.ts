'use server'

import BookSegment from '@/database/models/book-segment.model';
import Book from '@/database/models/book.model';
import { connectToDatabase } from '@/database/mongoose';
import { CreateBook, TextSegment } from '@/types';
import { escapeRegex, generateSlug, serializeData } from '../utils';
import mongoose from 'mongoose';
import { revalidatePath } from 'next/cache';

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

    revalidatePath('/')

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

export const getAllBooks = async () => {
  try {
    await connectToDatabase()

    const books = await Book.find().sort({ createdAt: -1 }).lean()

    return {
      success: true,
      data: serializeData(books)
    }
  } catch (error) {
    console.error('Error connecting to database', error)
    return {
      success: false,
      error
    }
  }
}

export const getBookBySlug = async (slug: string) => {
    try {
        await connectToDatabase();

        const book = await Book.findOne({ slug }).lean();

        if (!book) {
            return { success: false, error: 'Book not found' };
        }

        return {
            success: true,
            data: serializeData(book)
        }
    } catch (e) {
        console.error('Error fetching book by slug', e);
        return {
            success: false, error: e
        }
    }
}

export const searchBookSegments = async (bookId: string, query: string, limit: number = 5) => {
    try {
        await connectToDatabase();

        console.log(`Searching for: "${query}" in book ${bookId}`);

        const bookObjectId = new mongoose.Types.ObjectId(bookId);

        // Try MongoDB text search first (requires text index)
        let segments: Record<string, unknown>[] = [];
        try {
          segments = await BookSegment.find({
              bookId: bookObjectId,
              $text: { $search: query },
          })
          .select('_id bookId content segmentIndex pageNumber wordCount')
          .sort({ score: { $meta: 'textScore' } })
          .limit(limit)
          .lean();
        } catch {
            // Text index may not exist — fall through to regex fallback
          segments = [];
        }

        // Fallback: regex search matching ANY keyword
        if (segments.length === 0) {
          const keywords = query.split(/\s+/).filter((k) => k.length > 2);
          const pattern = keywords.map(escapeRegex).join('|');

          if(keywords.length === 0) {
            return {
              success: true,
              data: []
            }
          }

          segments = await BookSegment.find({
            bookId: bookObjectId,
            content: { $regex: pattern, $options: 'i' },
          })
          .select('_id bookId content segmentIndex pageNumber wordCount')
          .sort({ segmentIndex: 1 })
          .limit(limit)
          .lean();
        }

        console.log(`Search complete. Found ${segments.length} results`);

        return {
          success: true,
          data: serializeData(segments),
        };
    } catch (error) {
        console.error('Error searching segments:', error);
        return {
          success: false,
          error: (error as Error).message,
          data: [],
        };
    }
};