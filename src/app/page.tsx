import { redirect } from 'next/navigation';

/** There is no public landing page; send everyone into the app. */
export default function Home() {
  redirect('/dashboard');
}
