<?php

namespace Database\Factories;

use App\Models\Project;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Project>
 */
class ProjectFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->words(2, true),
            'project' => fake()->unique()->slug(2),
            'path' => '/Users/'.fake()->userName().'/Projects/'.fake()->slug(2),
            'repository' => 'git@github.com:'.fake()->userName().'/'.fake()->slug(2).'.git',
            'information' => fake()->sentence(),
            'url_local' => null,
            'url_dev' => null,
            'url_qa' => null,
            'url_staging' => null,
            'url_production' => null,
        ];
    }
}
