<?php

namespace App\Models;

use Database\Factories\ProjectFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A project on the dashboard: a Docker Compose project (matched by `project`, its
 * Compose name) or a local project that doesn't run in Docker.
 */
#[Fillable(['name', 'project', 'path', 'repository', 'information', 'url_local', 'url_dev', 'url_qa', 'url_staging', 'url_production'])]
class Project extends Model
{
    /** @use HasFactory<ProjectFactory> */
    use HasFactory;
}
