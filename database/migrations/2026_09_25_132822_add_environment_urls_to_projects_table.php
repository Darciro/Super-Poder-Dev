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
        Schema::table('projects', function (Blueprint $table) {
            // Where each environment of the project is deployed.
            $table->string('url_dev', 2048)->nullable()->after('repository');
            $table->string('url_qa', 2048)->nullable()->after('url_dev');
            $table->string('url_staging', 2048)->nullable()->after('url_qa');
            $table->string('url_production', 2048)->nullable()->after('url_staging');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn(['url_dev', 'url_qa', 'url_staging', 'url_production']);
        });
    }
};
