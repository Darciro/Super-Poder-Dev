<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;

/**
 * A value set in the app's settings, by key (see IntegrationSettings).
 */
#[Fillable(['key', 'value'])]
#[Table(key: 'key', keyType: 'string', incrementing: false)]
class Setting extends Model {}
