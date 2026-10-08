import { Head, usePage } from '@inertiajs/react';
import AppLogoIcon from '@/components/app-logo-icon';
import Heading from '@/components/heading';
import { show as showAbout } from '@/routes/about';

type About = {
    name: string;
    version: string;
    environment: string;
    laravel: string;
    php: string;
};

export default function AboutSettings({ about }: { about: About }) {
    const { desktop } = usePage().props;

    const details = [
        { label: 'Version', value: about.version },
        { label: 'Runs as', value: desktop ? 'Desktop app' : 'Browser' },
        { label: 'Environment', value: about.environment },
        { label: 'Laravel', value: about.laravel },
        { label: 'PHP', value: about.php },
    ];

    return (
        <>
            <Head title="About" />

            <h1 className="sr-only">About</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="About"
                    description="The app's version and the platform it runs on"
                />

                <section className="overflow-hidden rounded-xl border bg-card">
                    <header className="flex items-center gap-3 border-b px-4 py-4">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <AppLogoIcon className="size-7" />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate font-semibold">
                                {about.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Version{' '}
                                <span className="font-mono text-foreground">
                                    {about.version}
                                </span>
                            </p>
                        </div>
                    </header>
                    <dl className="divide-y text-sm">
                        {details.map(({ label, value }) => (
                            <div
                                key={label}
                                className="flex items-center justify-between gap-4 px-4 py-2.5"
                            >
                                <dt className="text-muted-foreground">
                                    {label}
                                </dt>
                                <dd className="truncate font-mono text-xs">
                                    {value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>
            </div>
        </>
    );
}

AboutSettings.layout = {
    breadcrumbs: [
        {
            title: 'About',
            href: showAbout(),
        },
    ],
};
