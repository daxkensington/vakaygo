# Offline guard checks against the exact import helper, without Rails or network.
require "openssl"
require "stringio"

class TestDomain
  attr_accessor :dkim_private_key, :dns_checked_at, :dkim_status, :spf_status, :created_at, :verified_at
  def initialize
    @dkim_private_key = OpenSSL::PKey::RSA.new(1024).to_pem
    @created_at = Time.now
    # Postal's administrator UI sets this immediately at domain creation.
    @verified_at = Time.now
  end
  def with_lock
    yield
  end
  def update!(dkim_private_key:)
    @dkim_private_key = dkim_private_key
  end
end

class TestDomains
  def find_by!(name:)
    raise "Wrong domain lookup" unless name == "vakaygo.com"
    $test_domain
  end
end

class Server
  def self.find_by!(uuid:)
    raise "Wrong server lookup" unless uuid == "21f81060-ab84-45f9-a725-8c20818f2dd4"
    new
  end
  def mode
    $test_mode
  end
  def domains
    TestDomains.new
  end
end

class << File
  alias_method :test_original_read, :read
  def read(filename, *args)
    return $test_prepared_key if filename == "/config/vakaygo-dkim.key"
    test_original_read(filename, *args)
  end
end

$test_prepared_key = OpenSSL::PKey::RSA.new(2048).to_pem
helper = File.expand_path("import-domain-key.rb", __dir__)
cases = 0
run = lambda do |reject:, change: true, &setup|
  $test_domain = TestDomain.new
  $test_mode = "Development"
  ENV["VAKAYGO_POSTAL_SERVER_UUID"] = "21f81060-ab84-45f9-a725-8c20818f2dd4"
  setup&.call
  previous = $test_domain.dkim_private_key
  stdout, stderr = $stdout, $stderr
  begin
    $stdout = StringIO.new
    $stderr = StringIO.new
    refused = false
    begin
      load helper
    rescue SystemExit
      refused = true
    end
    raise "Unexpected guard decision" unless refused == reject
    changed = previous != $test_domain.dkim_private_key
    raise "Unexpected key mutation" unless changed == (change && !reject)
  ensure
    $stdout, $stderr = stdout, stderr
  end
  cases += 1
end

run.call(reject: false) # fresh administrator-created domain works
run.call(reject: false, change: false) { $test_domain.dkim_private_key = $test_prepared_key }
run.call(reject: true) { $test_mode = "Live" }
run.call(reject: true) { $test_domain.dns_checked_at = Time.now }
run.call(reject: true) { $test_domain.dkim_status = "OK" }
run.call(reject: true) { $test_domain.spf_status = "Missing" }
run.call(reject: true) { $test_domain.created_at = Time.now - 90_000 }
run.call(reject: true) { $test_domain.dkim_private_key = OpenSSL::PKey::RSA.new(2048).to_pem }
run.call(reject: true) { ENV["VAKAYGO_POSTAL_SERVER_UUID"] = "not-a-uuid" }
puts "#{cases} initial-key guard checks passed; no Rails, network or delivery."
