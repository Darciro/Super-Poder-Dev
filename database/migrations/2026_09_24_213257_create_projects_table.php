<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            // Display name, e.g. "Clube Poder360".
            $table->string('name')->nullable();
            // Identifier: the Docker Compose project name (com.docker.compose.project label),
            // or a slug for local projects that don't run in Docker.
            $table->string('project')->unique();
            // Where the project lives on this machine.
            $table->string('path', 1024)->nullable();
            // Git remote, e.g. git@github.com:org/repo.git.
            $table->string('repository', 1024)->nullable();
            // Free-form notes.
            $table->text('information')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('projects');
    }
};
