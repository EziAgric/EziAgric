import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';

const steps = [
  {
    number: '1',
    title: 'List your goods',
    description:
      'Tell buyers what you have to sell — crops, livestock, or produce — and set your price.',
  },
  {
    number: '2',
    title: 'Agree on a deal',
    description:
      'A buyer accepts your offer. The money is held safely until the goods arrive.',
  },
  {
    number: '3',
    title: 'Deliver and get paid',
    description:
      'Once your goods arrive, the payment is released straight to you. No middlemen.',
  },
];

const trustIndicators = [
  { label: 'Trades completed', value: '12,400+' },
  { label: 'Total value transacted', value: '$3.2M+' },
];

const Home: NextPage = () => {
  return (
    <>
      <Head>
        <title>FarmTrade — Get paid when your goods arrive</title>
        <meta
          name="description"
          content="Sell your crops and livestock directly to buyers. Get paid when your goods arrive. No middlemen."
        />
      </Head>

      <main className="mx-auto max-w-5xl px-4 py-16">
        <section className="text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Get paid when your goods arrive. No middlemen.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
            Sell your crops and livestock directly to buyers you can trust. Your
            money is kept safe until delivery — so you always get paid for your
            hard work.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/marketplace"
              className="rounded-lg bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700"
            >
              Start selling your goods
            </Link>
            <Link
              href="/how-it-works"
              className="rounded-lg border border-green-600 px-6 py-3 font-semibold text-green-700 hover:bg-green-50"
            >
              See how it works
            </Link>
          </div>
        </section>

        <section className="mt-20">
          <h2 className="text-center text-3xl font-bold">How it works</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            {steps.map((step) => (
              <li key={step.number} className="text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-xl font-bold text-white">
                  {step.number}
                </span>
                <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
                <p className="mt-2 text-gray-600">{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-20 rounded-2xl bg-green-50 px-6 py-10">
          <dl className="grid gap-8 text-center sm:grid-cols-2">
            {trustIndicators.map((indicator) => (
              <div key={indicator.label}>
                <dt className="text-sm font-medium uppercase tracking-wide text-gray-600">
                  {indicator.label}
                </dt>
                <dd className="mt-2 text-4xl font-bold text-green-700">
                  {indicator.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-20 text-center">
          <h2 className="text-3xl font-bold">Ready to sell your harvest?</h2>
          <p className="mx-auto mt-4 max-w-xl text-gray-600">
            Join thousands of farmers who get paid on time, every time.
          </p>
          <Link
            href="/marketplace"
            className="mt-8 inline-block rounded-lg bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700"
          >
            List your goods today
          </Link>
        </section>
      </main>
    </>
  );
};

export default Home;
