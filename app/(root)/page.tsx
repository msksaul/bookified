import BookCard from '@/components/BookCard';
import HeroSection from '@/components/HeroSection';
import { getAllBooks } from '@/lib/actions/book.actions';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic'

export default async function Home() {

  const bookResulsts = await getAllBooks()
  const books = bookResulsts.success ? bookResulsts.data ?? [] : []
  const { userId } = await auth()

  return (
    <main className='wrapper container'>

      {!userId ? (
        <div className='flex items-center justify-center pb-8'>
          <h3 className='library-step-title text-lg font-bold'>Sign in to try the app</h3>
        </div>
      ) : null}

      <HeroSection userId={userId}/>

      <div className='library-books-grid'>
        {books.map((book) => (
          <BookCard
            key={book._id}
            title={book.title}
            author={book.author}
            coverURL={book.coverURL}
            slug={book.slug}
            userId={userId}
          />
        ))}
      </div>
    </main>
  );
}
