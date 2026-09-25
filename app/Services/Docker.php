<?php

namespace App\Services;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/**
 * Access to the Docker Engine API through its Unix socket.
 */
class Docker
{
    public function socket(): string
    {
        return config('services.docker.socket');
    }

    /**
     * HTTP client bound to the Docker Engine Unix socket.
     */
    public function http(): PendingRequest
    {
        return Http::withOptions($this->options());
    }

    /**
     * Guzzle options to reach the Docker Engine Unix socket.
     *
     * @return array<string, mixed>
     */
    public function options(): array
    {
        return ['curl' => [CURLOPT_UNIX_SOCKET_PATH => $this->socket()]];
    }
}
