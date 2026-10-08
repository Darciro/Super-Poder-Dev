import { Form, Head } from '@inertiajs/react';
import IntegrationsController from '@/actions/App/Http/Controllers/Settings/IntegrationsController';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { edit } from '@/routes/integrations';

type Setting = {
    /** Set on this page; empty when using the default. */
    value: string;
    default: string;
    /** Whether the tool is where the setting points to (null: nothing to check). */
    found: boolean | null;
};

type Key =
    | 'docker_socket'
    | 'caddy_binary'
    | 'caddy_config'
    | 'caddy_admin'
    | 'ide_command';

type Field = {
    key: Key;
    label: string;
    description: string;
};

const sections: { title: string; description: string; fields: Field[] }[] = [
    {
        title: 'Docker',
        description: 'Containers, their stats and terminals',
        fields: [
            {
                key: 'docker_socket',
                label: 'Socket',
                description: 'Unix socket of the Docker Engine API.',
            },
        ],
    },
    {
        title: 'Caddy',
        description: 'The local reverse proxy shown on the dashboard',
        fields: [
            {
                key: 'caddy_binary',
                label: 'Binary',
                description: 'Used to start Caddy.',
            },
            {
                key: 'caddy_config',
                label: 'Caddyfile',
                description:
                    'Sites listed on the dashboard, and the config Caddy starts with.',
            },
            {
                key: 'caddy_admin',
                label: 'Admin API',
                description:
                    'Used to check whether Caddy runs, and to stop it.',
            },
        ],
    },
    {
        title: 'IDE',
        description: 'Opening projects from the dashboard',
        fields: [
            {
                key: 'ide_command',
                label: 'Command',
                description:
                    'Shell command that opens a folder; the project path is appended. E.g. code, cursor, open -a "PhpStorm".',
            },
        ],
    },
];

function Status({ found }: { found: boolean | null }) {
    if (found === null) {
        return null;
    }

    return found ? (
        <Badge variant="secondary">Found</Badge>
    ) : (
        <Badge variant="destructive">Not found</Badge>
    );
}

export default function Integrations({
    settings,
}: {
    settings: Record<Key, Setting>;
}) {
    return (
        <>
            <Head title="Integrations" />

            <h1 className="sr-only">Integrations</h1>

            <Form
                {...IntegrationsController.update.form()}
                options={{
                    preserveScroll: true,
                }}
                className="space-y-12"
            >
                {({ processing, errors }) => (
                    <>
                        {sections.map((section) => (
                            <div key={section.title} className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={section.title}
                                    description={section.description}
                                />

                                {section.fields.map((field) => (
                                    <div key={field.key} className="grid gap-2">
                                        <div className="flex items-center gap-2">
                                            <Label htmlFor={field.key}>
                                                {field.label}
                                            </Label>
                                            <Status
                                                found={
                                                    settings[field.key].found
                                                }
                                            />
                                        </div>

                                        <Input
                                            id={field.key}
                                            name={field.key}
                                            className="mt-1 block w-full font-mono text-sm"
                                            defaultValue={
                                                settings[field.key].value
                                            }
                                            placeholder={
                                                settings[field.key].default
                                            }
                                            spellCheck={false}
                                            autoComplete="off"
                                        />

                                        <p className="text-sm text-muted-foreground">
                                            {field.description} Leave empty to
                                            use the default.
                                        </p>

                                        <InputError
                                            message={errors[field.key]}
                                        />
                                    </div>
                                ))}
                            </div>
                        ))}

                        <Button
                            disabled={processing}
                            data-test="update-integrations-button"
                        >
                            Save
                        </Button>
                    </>
                )}
            </Form>
        </>
    );
}

Integrations.layout = {
    breadcrumbs: [
        {
            title: 'Integrations',
            href: edit(),
        },
    ],
};
