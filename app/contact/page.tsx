export default function ContactPage() {
    return (
        <div className="max-w-xl mx-auto py-8 space-y-4">
            <h1 className="text-2xl md:text-3xl font-semibold">
                Questions or Feedback?
            </h1>
            <p className="text-lg text-gray-700">
                We&apos;d love to hear from you.
            </p>
            <p className="text-base text-gray-700">
                Email:{' '}
                <a
                    href="mailto:bruteforce@gmail.com"
                    className="text-emerald-700 font-medium underline underline-offset-2 hover:no-underline"
                >
                    bruteforce@gmail.com
                </a>
            </p>
        </div>
    )
}
