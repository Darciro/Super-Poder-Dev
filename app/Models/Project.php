<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A project on the dashboard: a Docker Compose project (matched by `project`, its
 * Compose name) or a local project that doesn't run in Docker.
 */
#[Fillable(['name', 'project', 'path', 'repository', 'information'])]
class Project extends Model
{
    /** @use HasFactory<\Database\Factories\ProjectFactory> */
    use HasFactory;
}
