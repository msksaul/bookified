import BookCard from '@/components/BookCard';
import HeroSection from '@/components/HeroSection';
import { getAllBooks } from '@/lib/actions/book.actions';

export const dynamic = 'force-dynamic'

export default async function Home() {

  const bookResulsts = await getAllBooks()
  const books = bookResulsts.success ? bookResulsts.data ?? [] : []

  return (
    <main className='wrapper container'>
      <HeroSection />

      <div className='library-books-grid'>
        {books.map((book) => (
          <BookCard
            key={book._id}
            title={book.title}
            author={book.author}
            coverURL={book.coverURL}
            slug={book.slug}
          />
        ))}
      </div>
    </main>
  );
}
