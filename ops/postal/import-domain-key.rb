# Run using the pinned Postal image's Rails runner after creating this exact
# Development server/domain in its authenticated UI, before any DNS checks.
require "openssl"
uuid = ENV.fetch("VAKAYGO_POSTAL_SERVER_UUID")
abort "Invalid server UUID" unless uuid.match?(/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/)
server = Server.find_by!(uuid: uuid)
domain = server.domains.find_by!(name: "vakaygo.com")
abort "Initial-key import requires a Development server" unless server.mode == "Development"
key = OpenSSL::PKey::RSA.new(File.read("/config/vakaygo-dkim.key"))
abort "Expected a private RSA2048 key" unless key.private? && key.n.num_bits == 2048
domain.with_lock do
  existing = OpenSSL::PKey::RSA.new(domain.dkim_private_key)
  if existing.public_key.to_der == key.public_key.to_der
    puts "Prepared key already installed; no change."
  else
    # An administrator's newly-created domain is ownership-verified immediately
    # in Postal; that does not mean its DKIM has been published or checked.
    fresh = domain.created_at && domain.created_at >= Time.now - 86_400 && domain.created_at <= Time.now
    abort "Refusing key rotation: domain must be fresh and never DNS-checked" unless fresh && domain.dns_checked_at.nil? && domain.dkim_status.nil? && domain.spf_status.nil? && existing.n.num_bits == 1024
    domain.update!(dkim_private_key: key.to_pem)
    puts "Initial domain key installed; publish the public record shown in Postal and recheck DNS."
  end
end
